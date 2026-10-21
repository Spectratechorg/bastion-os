import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alerts, attendance, guards, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { distanceMetres, lagosParts, PATROL_SLOTS, slotForHour } from '@/lib/server'

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
    .where(and(eq(guards.organizationId, organizationId), eq(guards.nfcToken, token)))
    .limit(1)

  if (!guard) {
    return NextResponse.json({ error: 'This NFC token is not registered for your active organization.' }, { status: 404 })
  }
  if (guard.status === 'suspended') {
    return NextResponse.json({ error: `${guard.name} is suspended and cannot check in or patrol.` }, { status: 403 })
  }

  const now = new Date()
  const latitude = body.latitude != null && Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null
  const longitude = body.longitude != null && Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null
  const [site] = guard.site ? await db.select().from(sites).where(and(eq(sites.organizationId, organizationId), eq(sites.name, guard.site))).limit(1) : []
  const siteId = site?.id ?? null
  const inside = site && latitude !== null && longitude !== null ? distanceMetres(latitude, longitude, site.latitude, site.longitude) <= site.geofenceRadius : true
  const guardInfo = { id: guard.id, name: guard.name, photoUrl: guard.photoUrl, site: guard.site }

  if (action === 'sos') {
    await db.insert(alerts).values({ userId: session.user.id, organizationId, type: 'sos', title: 'SOS activated', body: `${guard.name} at ${guard.site ?? 'unassigned site'} needs help${latitude !== null ? ` (${latitude.toFixed(5)}, ${longitude?.toFixed(5)})` : ''}`, severity: 'critical', acknowledged: false, createdAt: now })
    return NextResponse.json({ ok: true, action: 'sos', guard: guardInfo, message: 'SOS sent. Your supervisor has been alerted.' })
  }

  if (action === 'attendance') {
    const [record] = await db.insert(attendance).values({
      userId: session.user.id,
      organizationId,
      guardId: guard.id,
      siteId,
      checkedInAt: now,
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
      method: 'nfc',
      withinGeofence: inside,
      reviewStatus: inside ? 'approved' : 'flagged',
      createdAt: now,
    }).returning()

    await db.update(guards).set({ lastCheckIn: now, lastLatitude: latitude, lastLongitude: longitude }).where(eq(guards.id, guard.id))
    if (!inside) await db.insert(alerts).values({ userId: session.user.id, organizationId, type: 'geofence', title: 'Outside geofence', body: `${guard.name} checked in outside ${guard.site}`, severity: 'high', acknowledged: false, createdAt: now })

    return NextResponse.json({
      ok: true,
      action: 'attendance',
      guard: guardInfo,
      inside,
      message: inside ? `Attendance recorded for ${guard.name}.` : `Attendance recorded for ${guard.name}, but outside the site geofence. It was flagged for review.`,
      record,
    })
  }

  // Patrol: one patrol per guard per day. Signing the 10:00, 11:00 and 12:00 checkpoints completes it.
  const parts = lagosParts(now)
  const slot = slotForHour(parts.hour)
  if (!slot) return NextResponse.json({ error: 'Patrol checkpoints can only be signed between 09:00 and 12:59.' }, { status: 400 })

  let [patrol] = await db.select().from(patrols).where(and(eq(patrols.organizationId, organizationId), eq(patrols.guardId, guard.id), eq(patrols.patrolDate, parts.date))).limit(1)
  if (!patrol) {
    ;[patrol] = await db.insert(patrols).values({
      userId: session.user.id, organizationId, guardId: guard.id, siteId, loggedAt: now, latitude: latitude ?? 0, longitude: longitude ?? 0,
      method: 'nfc', withinBounds: inside, routeName: 'Daily patrol', checkpoint: slot, progress: 0, status: 'in_progress', patrolDate: parts.date, createdAt: now,
    }).returning()
  }
  const inserted = await db.insert(patrolCheckpoints).values({ userId: session.user.id, organizationId, patrolId: patrol.id, guardId: guard.id, slot, signedAt: now, latitude, longitude }).onConflictDoNothing().returning()
  if (inserted.length === 0) return NextResponse.json({ error: `${slot} checkpoint is already signed for ${guard.name}.` }, { status: 409 })

  const signed = (await db.select().from(patrolCheckpoints).where(eq(patrolCheckpoints.patrolId, patrol.id))).length
  const complete = signed >= PATROL_SLOTS.length
  const [record] = await db.update(patrols).set({ progress: Math.round((signed / PATROL_SLOTS.length) * 100), status: complete ? 'completed' : 'in_progress', checkpoint: slot }).where(eq(patrols.id, patrol.id)).returning()

  return NextResponse.json({
    ok: true,
    action: 'patrol',
    guard: guardInfo,
    slot,
    signed,
    total: PATROL_SLOTS.length,
    complete,
    message: complete ? `${slot} signed. Patrol complete for ${guard.name} (${signed} of ${PATROL_SLOTS.length}).` : `${slot} checkpoint signed for ${guard.name} (${signed} of ${PATROL_SLOTS.length}).`,
    record,
  })
}
