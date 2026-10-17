import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { attendance, guards, patrols } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

async function resolveActiveOrganizationId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return (session.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId ?? null
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local before enabling NFC verification.' }, { status: 503 })
  }

  const organizationId = await resolveActiveOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'No active organization. Create or join an organization before scanning tags.' }, { status: 403 })
  }

  const body = await request.json()
  const action = String(body.type ?? 'attendance')
  const rawToken = String(body.token ?? '').trim()

  if (!rawToken) {
    return NextResponse.json({ error: 'A registered NFC token is required.' }, { status: 400 })
  }

  const token = rawToken.replace(/^nfc:/i, '').trim()
  const [guard] = await db
    .select()
    .from(guards)
    .where(and(eq(guards.organizationId, organizationId), eq(guards.userId, session.user.id), eq(guards.nfcToken, token)))
    .limit(1)

  if (!guard) {
    return NextResponse.json({ error: 'This NFC token is not registered for your active organization.' }, { status: 404 })
  }

  const now = new Date()
  const siteId = body.siteId ? String(body.siteId) : null
  const latitude = body.latitude != null ? Number(body.latitude) : 0
  const longitude = body.longitude != null ? Number(body.longitude) : 0

  if (action === 'attendance') {
    const [record] = await db.insert(attendance).values({
      userId: session.user.id,
      organizationId,
      guardId: guard.id,
      siteId,
      checkedInAt: now,
      latitude,
      longitude,
      method: 'nfc',
      withinGeofence: true,
      createdAt: now,
    }).returning()

    await db.update(guards).set({ lastCheckIn: now, lastLatitude: latitude, lastLongitude: longitude }).where(eq(guards.id, guard.id))

    return NextResponse.json({
      ok: true,
      action: 'attendance',
      guardId: guard.id,
      message: 'Attendance verified via registered NFC token.',
      record,
    })
  }

  const [record] = await db.insert(patrols).values({
    userId: session.user.id,
    organizationId,
    guardId: guard.id,
    siteId,
    loggedAt: now,
    latitude,
    longitude,
    method: 'nfc',
    withinBounds: true,
    createdAt: now,
  }).returning()

  return NextResponse.json({
    ok: true,
    action: 'patrol',
    guardId: guard.id,
    message: 'Patrol checkpoint verified via registered NFC token.',
    record,
  })
}
