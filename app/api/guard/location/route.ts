import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { alerts, attendance, guardLocations, guards, sites } from '@/lib/db/schema'
import { organizationForGuardAppCode, ownerUserId } from '@/lib/guard-access'
import { lagosParts, memberRole } from '@/lib/server'

export const dynamic = 'force-dynamic'

const locationPingSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().optional(),
  batteryLevel: z.number().finite().optional(),
  speed: z.number().finite().optional(),
  guardId: z.string().optional(),
  code: z.string().trim().optional(),
})

function calculateDistanceMeters(latitude: number, longitude: number, siteLatitude: number, siteLongitude: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_000
  const deltaLatitude = radians(siteLatitude - latitude)
  const deltaLongitude = radians(siteLongitude - longitude)
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(siteLatitude)) * Math.sin(deltaLongitude / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(earthRadiusMeters * c)
}

/**
 * Live GPS Telemetry Sync for Guards on Duty.
 * Continuously tracks phone coordinates, monitors site geofence boundaries,
 * and records departure time, distance, and absence duration when breaches occur.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsed = locationPingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid coordinates provided.' }, { status: 400 })
  }

  const session = await getActiveOrganization()
  let currentUser: { userId: string; organizationId: string } | null = null

  if (session?.organizationId) {
    currentUser = { userId: session.userId, organizationId: session.organizationId }
  } else if (parsed.data.code) {
    const org = await organizationForGuardAppCode(parsed.data.code)
    if (org) {
      const ownerId = await ownerUserId(org.id)
      if (ownerId) currentUser = { userId: ownerId, organizationId: org.id }
    }
  }

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { latitude, longitude, accuracy, batteryLevel, speed, guardId } = parsed.data
  const now = new Date()

  // 1. Identify guard: by guardId, loginUserId, or active guard
  let guard: typeof guards.$inferSelect | undefined

  if (guardId) {
    const [byId] = await db
      .select()
      .from(guards)
      .where(and(eq(guards.organizationId, currentUser.organizationId), eq(guards.id, guardId)))
      .limit(1)
    guard = byId
  }

  if (!guard) {
    const [byLogin] = await db
      .select()
      .from(guards)
      .where(and(eq(guards.organizationId, currentUser.organizationId), eq(guards.loginUserId, currentUser.userId)))
      .limit(1)
    guard = byLogin
  }

  if (!guard) {
    const [latest] = await db
      .select({ guard: guards })
      .from(guards)
      .where(and(eq(guards.organizationId, currentUser.organizationId), eq(guards.status, 'active')))
      .limit(1)
    guard = latest?.guard
  }

  if (!guard) {
    return NextResponse.json({ ok: true, tracked: false, message: 'No guard record linked.' })
  }

  // 2. Fetch assigned site
  const site = guard.site
    ? (await db
        .select()
        .from(sites)
        .where(and(eq(sites.organizationId, currentUser.organizationId), eq(sites.name, guard.site), eq(sites.status, 'active')))
        .limit(1))[0]
    : undefined

  // 3. Log live GPS telemetry
  try {
    await db.insert(guardLocations).values({
      organizationId: currentUser.organizationId,
      guardId: guard.id,
      siteId: site?.id ?? null,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      batteryLevel: batteryLevel ?? null,
      speed: speed ?? null,
      source: 'guard_app',
      recordedAt: now,
    })
  } catch (err) {
    console.warn('[Location API] Could not write to guardLocations:', err)
  }

  await db
    .update(guards)
    .set({ lastLatitude: latitude, lastLongitude: longitude })
    .where(eq(guards.id, guard.id))

  // 4. Check if currently checked in (on duty)
  const [activeAttendance] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.organizationId, currentUser.organizationId), eq(attendance.guardId, guard.id), isNull(attendance.checkedOutAt)))
    .orderBy(desc(attendance.checkedInAt))
    .limit(1)

  if (!activeAttendance || !site) {
    return NextResponse.json({
      ok: true,
      onDuty: false,
      guardName: guard.name,
      tracked: true,
    })
  }

  // 5. Calculate Geofence Proximity
  const distance = calculateDistanceMeters(latitude, longitude, site.latitude, site.longitude)
  const withinBounds = distance <= site.geofenceRadius
  const dedupeKey = `geofence:breach:${guard.id}:${activeAttendance.id}`

  // A) OUTSIDE PERIMETER (BREACH IN PROGRESS)
  if (!withinBounds) {
    const excessDistance = Math.max(0, distance - site.geofenceRadius)

    const [existingAlert] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.organizationId, currentUser.organizationId), eq(alerts.dedupeKey, dedupeKey)))
      .limit(1)

    let minutesAway = 1
    if (!existingAlert) {
      // First departure detected
      await db.insert(alerts).values({
        userId: currentUser.userId,
        organizationId: currentUser.organizationId,
        type: 'geofence',
        title: `⚠️ Geofence Breach: ${guard.name} off-site`,
        body: `${site.name} · Left post at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${excessDistance}m outside perimeter`,
        severity: 'high',
        acknowledged: false,
        dedupeKey,
        createdAt: now,
      })
    } else {
      // Ongoing departure: update how long and how far
      minutesAway = Math.max(1, Math.round((now.getTime() - existingAlert.createdAt.getTime()) / 60000))
      const severity = minutesAway >= 15 ? 'critical' : 'high'

      await db
        .update(alerts)
        .set({
          body: `${site.name} · Left post at ${existingAlert.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${excessDistance}m outside perimeter · Away for ${minutesAway} min${minutesAway === 1 ? '' : 's'}`,
          severity,
          acknowledged: false,
        })
        .where(eq(alerts.id, existingAlert.id))
    }

    return NextResponse.json({
      ok: true,
      onDuty: true,
      withinBounds: false,
      distance,
      excessDistance,
      geofenceRadius: site.geofenceRadius,
      siteName: site.name,
      minutesAway,
      message: `Perimeter breach: You are ${excessDistance}m outside ${site.name}. Supervisors have been notified.`,
    })
  }

  // B) INSIDE PERIMETER (ON POST)
  // Check if guard previously had an active breach and has now returned
  const [existingAlert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.organizationId, currentUser.organizationId), eq(alerts.dedupeKey, dedupeKey)))
    .limit(1)

  if (existingAlert && !existingAlert.acknowledged) {
    const minutesAway = Math.max(1, Math.round((now.getTime() - existingAlert.createdAt.getTime()) / 60000))
    await db
      .update(alerts)
      .set({
        title: `✅ Geofence Resolved: ${guard.name} returned`,
        body: `${site.name} · Guard returned to post after ${minutesAway} min${minutesAway === 1 ? '' : 's'} departure.`,
        acknowledged: true,
      })
      .where(eq(alerts.id, existingAlert.id))
  }

  return NextResponse.json({
    ok: true,
    onDuty: true,
    withinBounds: true,
    distance,
    geofenceRadius: site.geofenceRadius,
    siteName: site.name,
    message: `On post: Within ${site.name} perimeter.`,
  })
}
