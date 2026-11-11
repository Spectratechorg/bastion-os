import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guards, sites } from '@/lib/db/schema'
import { todayStatus } from '@/lib/guard-today'
import { organizationForGuardAppCode } from '@/lib/guard-access'
import { raiseAlert } from '@/lib/alerts'
import { actor, fail } from '@/lib/server'

export const dynamic = 'force-dynamic'

async function organizationFor(request: Request, body?: { code?: unknown }) {
  const current = await actor()
  if (current) return current.organizationId
  const code = typeof body?.code === 'string' ? body.code : ''
  if (!code.trim()) return null
  const organization = await organizationForGuardAppCode(code)
  return organization?.id ?? null
}

async function scheduleFor(organizationId: string, guard: typeof guards.$inferSelect) {
  const [assignedSite] = guard.site
    ? await db.select({ id: sites.id, name: sites.name, latitude: sites.latitude, longitude: sites.longitude, geofenceRadius: sites.geofenceRadius })
      .from(sites).where(and(eq(sites.organizationId, organizationId), eq(sites.name, guard.site), eq(sites.status, 'active'))).limit(1)
    : []
  const status = await todayStatus(organizationId, guard.id)
  if (status.morning?.missed) {
    await raiseAlert({
      userId: guard.userId,
      organizationId,
      type: 'attendance',
      title: 'Missed morning sign-in',
      body: `${guard.name} did not sign in by 08:00${guard.site ? ` at ${guard.site}` : ''}`,
      severity: 'high',
      key: `morning:${guard.id}:${status.shiftDate}`,
    })
  }
  if (status.closed && status.missedSlots && status.missedSlots.length > 0) {
    await raiseAlert({
      userId: guard.userId,
      organizationId,
      type: 'patrol',
      title: 'Missed patrol',
      body: `${guard.name} missed ${status.missedSlots.join(', ')}${guard.site ? ` at ${guard.site}` : ''}`,
      severity: 'medium',
      key: `patrol:${guard.id}:${status.shiftDate}`,
    })
  }
  return NextResponse.json({
    guard: { id: guard.id, name: guard.name, guardCode: guard.guardCode, nin: guard.nin, site: guard.site, photoUrl: guard.photoUrl, status: guard.status },
    assignedSite: assignedSite ?? null,
    ...status,
  })
}

/** The schedule for the guard signed in on this phone. */
export async function GET() {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor()
  if (!current) return fail('Sign in, or enter a guard ID with the company code.', 401)
  const [guard] = await db.select().from(guards)
    .where(and(eq(guards.organizationId, current.organizationId), eq(guards.loginUserId, current.userId))).limit(1)
  if (!guard) return fail('Your login is not linked to a guard profile.', 404)
  return scheduleFor(current.organizationId, guard)
}

/** Look a guard up by their ID number (NIN or guard UUID) so the app can show their configured shift. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const body = await request.json().catch(() => null) as { id?: unknown; code?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!id) return fail('Enter your guard ID number.', 400)
  const organizationId = await organizationFor(request, body ?? undefined)
  if (!organizationId) return fail('Enter the company guard app code, or sign in first.', 401)
  const [guard] = await db.select().from(guards)
    .where(and(eq(guards.organizationId, organizationId), sql`(${guards.id}::text = ${id} or ${guards.nin} = ${id} or ${guards.guardCode} = ${id})`))
    .limit(1)
  if (!guard) return fail('No guard in this company matches that ID number.', 404)
  return scheduleFor(organizationId, guard)
}
