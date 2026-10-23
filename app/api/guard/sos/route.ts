import { NextResponse } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { alerts, guards } from '@/lib/db/schema'
import { raiseAlert } from '@/lib/alerts'
import { organizationForGuardAppCode, ownerUserId } from '@/lib/guard-access'
import { lagosParts } from '@/lib/server'

export const dynamic = 'force-dynamic'

const sosSchema = z.object({
  token: z.string().trim().min(1).max(200),
  code: z.string().trim().max(64).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
})

/** A guard presses SOS: raise a critical alert for the supervisors. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const parsed = sosSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Provide the guard tag token.' }, { status: 400 })

  const token = parsed.data.token.replace(/^nfc:/i, '').trim()
  const organization = parsed.data.code ? await organizationForGuardAppCode(parsed.data.code) : null
  if (parsed.data.code && !organization) return NextResponse.json({ error: 'That guard app code is not recognised.' }, { status: 401 })
  const ownerId = organization ? await ownerUserId(organization.id) : null
  if (organization && !ownerId) return NextResponse.json({ error: 'This organization has no administrator to alert.' }, { status: 403 })

  const where = organization
    ? and(eq(guards.nfcToken, token), eq(guards.organizationId, organization.id))
    : eq(guards.nfcToken, token)
  const [guard] = await db.select().from(guards).where(where).limit(1)
  if (!guard) return NextResponse.json({ error: 'This guard tag is not registered.' }, { status: 404 })

  const recent = await db.select({ id: alerts.id }).from(alerts).where(and(
    eq(alerts.organizationId, guard.organizationId),
    eq(alerts.type, `sos.${guard.id}`),
    gte(alerts.createdAt, new Date(Date.now() - 5 * 60_000)),
  )).limit(1)
  if (recent.length) return NextResponse.json({ ok: true, duplicate: true, message: 'SOS already raised in the last 5 minutes.' })

  const location = parsed.data.latitude !== undefined && parsed.data.longitude !== undefined
    ? ` · ${parsed.data.latitude.toFixed(5)}, ${parsed.data.longitude.toFixed(5)}`
    : ''
  const row = await raiseAlert({
    userId: guard.userId,
    organizationId: guard.organizationId,
    type: `sos.${guard.id}`,
    title: `SOS from ${guard.name}`,
    body: `${guard.site ?? 'No site'} · ${lagosParts().date}${location}${parsed.data.note ? ` · ${parsed.data.note}` : ''}`,
    severity: 'critical',
  })
  return NextResponse.json({ ok: true, alertId: row?.id, message: 'SOS sent to your supervisors.' })
}
