import { NextResponse } from 'next/server'
import { and, count, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { raiseAlert } from '@/lib/alerts'
import { organizationForGuardAppCode, ownerUserId } from '@/lib/guard-access'
import { todayStatus } from '@/lib/guard-today'
import { currentShiftDate, guardShift, lagosParts, memberRole, normalizeShift, patrolSlots, slotForHour } from '@/lib/server'
import { invalidate } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const scanSchema = z.object({
  type: z.enum(['attendance', 'patrol', 'sos']),
  /** Optional for a guard signed in with their own login: their linked record is used. */
  token: z.string().trim().max(200).default(''),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  /** Shared guard-app code, used by phones that are not signed in. */
  code: z.string().trim().max(64).optional(),
  /** Guard ID number (NIN or guard UUID) for shared phones without an NFC tag. */
  guardId: z.string().trim().max(100).optional(),
  /** The scheduled checkpoint the guard selected in the patrol section. */
  slot: z.string().trim().max(5).optional(),
})

function calculateDistanceMeters(latitude: number, longitude: number, siteLatitude: number, siteLongitude: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_000
  const deltaLatitude = radians(siteLatitude - latitude)
  const deltaLongitude = radians(siteLongitude - longitude)
  const distance = 2 * earthRadiusMeters * Math.asin(Math.sqrt(
    Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(radians(latitude)) * Math.cos(radians(siteLatitude)) * Math.sin(deltaLongitude / 2) ** 2,
  ))
  return Math.round(distance)
}

function isWithinSite(latitude: number, longitude: number, site: typeof sites.$inferSelect) {
  const distance = calculateDistanceMeters(latitude, longitude, site.latitude, site.longitude)
  return distance <= site.geofenceRadius
}

/** A scan outside the geofence raises a high alert, or critical after three in a day. */
async function raiseBreachAlert(
  currentUser: { userId: string; organizationId: string },
  guard: typeof guards.$inferSelect,
  site: typeof sites.$inferSelect,
  _siteId: string,
) {
  const breachesToday = await db.select({ id: attendance.id }).from(attendance).where(and(
    eq(attendance.organizationId, currentUser.organizationId),
    eq(attendance.guardId, guard.id),
    eq(attendance.withinGeofence, false),
    gte(attendance.checkedInAt, new Date(Date.now() - 86400000)),
  ))
  await raiseAlert({
    userId: currentUser.userId,
    organizationId: currentUser.organizationId,
    type: 'geofence',
    title: `Geofence breach: ${guard.name}`,
    body: `${site.name} · scanned outside the ${site.geofenceRadius} m radius`,
    severity: breachesToday.length >= 3 ? 'critical' : 'high',
    key: `geofence:${guard.id}:${lagosParts().date}`,
  })
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local before enabling NFC verification.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (cause) {
    if (cause instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
    throw cause
  }
  const parsed = scanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Provide a scan type, registered token, and valid phone location.' }, { status: 400 })

  const session = await getActiveOrganization()
  let currentUser: { userId: string; organizationId: string } | null = null
  if (session?.organizationId) {
    currentUser = { userId: session.userId, organizationId: session.organizationId }
  } else if (parsed.data.code) {
    const organization = await organizationForGuardAppCode(parsed.data.code)
    if (!organization) return NextResponse.json({ error: 'That guard app code is not recognised. Ask your supervisor for the current code.' }, { status: 401 })
    const ownerId = await ownerUserId(organization.id)
    if (!ownerId) return NextResponse.json({ error: 'This organization has no administrator to record scans against.' }, { status: 403 })
    currentUser = { userId: ownerId, organizationId: organization.id }
  }
  if (!currentUser) return NextResponse.json({ error: 'Enter your company guard app code, or sign in, before scanning a guard tag.' }, { status: 401 })
  // A scan changes attendance/patrols; drop the short-lived list caches.
  invalidate('ops:'); invalidate('patrols:')

  const { type, latitude, longitude } = parsed.data
  const token = parsed.data.token.replace(/^nfc:/i, '').trim()

  // 1. Resolve Guard Record (via Login or NFC Token)
  let effectiveGuardId: string | null = null
  if (session?.organizationId && currentUser.userId === session.userId) {
    const [linked] = await db
      .select({ id: guards.id })
      .from(guards)
      .where(and(eq(guards.organizationId, currentUser.organizationId), eq(guards.loginUserId, currentUser.userId)))
      .limit(1)
  if (linked) effectiveGuardId = linked.id
  }

  if (!token && !effectiveGuardId && !parsed.data.guardId) {
    return NextResponse.json({ error: 'Enter your guard ID, sign in with your guard account, or tap your NFC tag.' }, { status: 400 })
  }

  const [guard] = await db
    .select()
    .from(guards)
    .where(and(
      eq(guards.organizationId, currentUser.organizationId),
      effectiveGuardId && !token
        ? eq(guards.id, effectiveGuardId)
        : token
          ? or(eq(guards.nfcToken, token), eq(guards.nin, token), eq(guards.guardCode, token))
          : sql`(${guards.id}::text = ${parsed.data.guardId ?? ''} or ${guards.nin} = ${parsed.data.guardId ?? ''} or ${guards.guardCode} = ${parsed.data.guardId ?? ''})`,
    ))
    .limit(1)

  if (!guard) {
    if (!token && !parsed.data.guardId) return NextResponse.json({ error: 'Your account is not linked to an active guard profile. Ask your supervisor to link it in Settings -> Team.' }, { status: 400 })
    if (parsed.data.guardId) return NextResponse.json({ error: 'No guard in this company matches that ID number.' }, { status: 404 })
    const [elsewhere] = await db.select({ id: guards.id }).from(guards).where(or(eq(guards.nfcToken, token), eq(guards.nin, token), eq(guards.guardCode, token))).limit(1)
    if (elsewhere) {
      return NextResponse.json({
        error: `This tag is registered to a guard in a different organization (code ${token}). Sign in, or enter the guard app code, for the organization that registered this guard.`,
      }, { status: 409 })
    }
    return NextResponse.json({
      error: `No guard anywhere in this database has the tag code this tag holds (${token}). Open Guards and verify the NFC tag code.`,
    }, { status: 404 })
  }

  if (effectiveGuardId && guard.id !== effectiveGuardId) {
    return NextResponse.json({ error: 'This tag belongs to another guard. Use your own tag.' }, { status: 403 })
  }
  if (guard.status === 'suspended') {
    return NextResponse.json({ error: `${guard.name} is suspended and cannot check in or patrol.` }, { status: 403 })
  }

  // 2. Emergency SOS
  if (type === 'sos') {
    await raiseAlert({
      userId: currentUser.userId,
      organizationId: currentUser.organizationId,
      type: 'sos',
      title: 'SOS activated',
      body: `${guard.name} at ${guard.site ?? 'an unassigned site'} needs help (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
      severity: 'critical',
      key: `sos:${guard.id}:${Math.floor(Date.now() / 60000)}`,
    })
    await db.update(guards).set({ lastLatitude: latitude, lastLongitude: longitude }).where(eq(guards.id, guard.id))
    return NextResponse.json({ ok: true, action: 'sos', guardId: guard.id, guardName: guard.name, message: 'SOS sent. Your supervisor has been alerted.' })
  }

  // 3. Assigned Site Verification
  const site = guard.site
    ? (await db.select().from(sites).where(and(
      eq(sites.organizationId, currentUser.organizationId),
      eq(sites.name, guard.site),
      eq(sites.status, 'active'),
    )).limit(1))[0]
    : undefined

  if (!site) {
    return NextResponse.json({ error: 'This guard has no active assigned site. Assign the guard to an active site in BastionOS before checking in.' }, { status: 409 })
  }

  const distance = calculateDistanceMeters(latitude, longitude, site.latitude, site.longitude)
  const withinBounds = distance <= site.geofenceRadius
  const now = new Date()
  const siteId = site.id

  // 4. Attendance Flow (Check In & Check Out)
  if (type === 'attendance') {
    const [activeAttendance] = await db
      .select()
      .from(attendance)
      .where(and(
        eq(attendance.organizationId, currentUser.organizationId),
        eq(attendance.guardId, guard.id),
        isNull(attendance.checkedOutAt),
      ))
      .orderBy(desc(attendance.checkedInAt))
      .limit(1)

    // CHECKOUT FLOW
    if (activeAttendance) {
      await db.update(attendance)
        .set({ checkedOutAt: now, ...(withinBounds ? {} : { withinGeofence: false }) })
        .where(eq(attendance.id, activeAttendance.id))

      if (!withinBounds) await raiseBreachAlert(currentUser, guard, site, siteId)

      return NextResponse.json({
        ok: true,
        status: await todayStatus(currentUser.organizationId, guard.id),
        action: 'attendance',
        checkedIn: false,
        guardId: guard.id,
        guardName: guard.name,
        siteName: site?.name ?? null,
        withinBounds,
        message: `Checked out ${guard.name}${site ? ` at ${site.name}` : ''}. Duty complete.`,
      })
    }

    // STRICT CHECK-IN FLOW:
    // If guard is NOT at their pre-assigned site, check-in is STRICTLY REJECTED!
    if (!withinBounds) {
      const excessDistance = Math.max(0, distance - site.geofenceRadius)
      return NextResponse.json({
        error: `Check-in rejected: You are ${distance}m away from ${site.name} (${excessDistance}m outside the ${site.geofenceRadius}m perimeter). You must be physically on-site to check in.`,
        distance,
        excessDistance,
        geofenceRadius: site.geofenceRadius,
        siteName: site.name,
        withinBounds: false,
      }, { status: 403 })
    }

    // Inside geofence: Check-in approved!
    const [record] = await db.insert(attendance).values({
      userId: currentUser.userId,
      organizationId: currentUser.organizationId,
      guardId: guard.id,
      siteId,
      checkedInAt: now,
      latitude,
      longitude,
      method: token ? 'nfc' : 'gps',
      withinGeofence: true,
      createdAt: now,
    }).returning()

    await db.update(guards)
      .set({ lastCheckIn: now, lastLatitude: latitude, lastLongitude: longitude, status: 'active' })
      .where(eq(guards.id, guard.id))

    const lagosNow = lagosParts(now)
    if (lagosNow.hour >= 8) {
      const dayStart = new Date(`${lagosNow.date}T00:00:00+01:00`)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      const [earlier] = await db.select({ id: attendance.id }).from(attendance).where(and(
        eq(attendance.organizationId, currentUser.organizationId),
        eq(attendance.guardId, guard.id),
        gte(attendance.checkedInAt, dayStart),
        lt(attendance.checkedInAt, dayEnd),
        lt(attendance.checkedInAt, now),
      )).limit(1)
      if (!earlier) await raiseAlert({
        userId: currentUser.userId,
        organizationId: currentUser.organizationId,
        type: 'attendance',
        title: 'Late morning sign-in',
        body: `${guard.name} signed in after the 08:00 deadline${site ? ` at ${site.name}` : ''}`,
        severity: 'high',
        key: `morning-late:${guard.id}:${lagosNow.date}`,
      })
    }

    return NextResponse.json({
      ok: true,
      status: await todayStatus(currentUser.organizationId, guard.id),
      action: 'attendance',
      checkedIn: true,
      guardId: guard.id,
      guardName: guard.name,
      siteName: site.name,
      withinBounds: true,
      distance,
      message: `Verified on-site: Checked in ${guard.name} at ${site.name}.`,
      record,
    })
  }

  // 5. Patrol Checkpoints Flow (Hourly Stay-Awake Check)
  // STRICT BLOCKING: Guard MUST be physically at their post / assigned site to complete hourly sign
  if (!withinBounds) {
    const excessDistance = Math.max(0, distance - site.geofenceRadius)
    await raiseBreachAlert(currentUser, guard, site, siteId)
    return NextResponse.json({
      error: `Hourly patrol rejected: You are ${distance}m away from ${site.name} (${excessDistance}m outside the ${site.geofenceRadius}m perimeter). You must be physically at your patrol location to complete your hourly stay-awake check-in.`,
      distance,
      excessDistance,
      geofenceRadius: site.geofenceRadius,
      siteName: site.name,
      withinBounds: false,
    }, { status: 403 })
  }

  const lagos = lagosParts(now)
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, currentUser.organizationId)).limit(1)
  const shift = guardShift(guard, normalizeShift(organization?.startHour, organization?.endHour))
  const slots = patrolSlots(shift)
  const currentSlot = slotForHour(lagos.hour, shift)
  const requestedSlot = parsed.data.slot?.trim()
  const slot = requestedSlot || currentSlot
  if (!currentSlot || !slot) {
    const shiftStart = `${String(shift.startHour).padStart(2, '0')}:00`
    const shiftEnd = `${String(shift.endHour).padStart(2, '0')}:00`
    return NextResponse.json({
      error: `Hourly patrol checkpoints can only be signed during active shift hours (${shiftStart} to ${shiftEnd} Lagos time). Current hour is ${String(lagos.hour).padStart(2, '0')}:00.`,
    }, { status: 409 })
  }

  if (!slots.includes(slot)) {
    return NextResponse.json({ error: `${slot} is not one of this guard's scheduled patrol checkpoints (${slots[0]}–${slots[slots.length - 1]}).` }, { status: 409 })
  }
  if (slots.indexOf(slot) > slots.indexOf(currentSlot)) {
    return NextResponse.json({ error: `${slot} has not started yet. The current checkpoint is ${currentSlot}.` }, { status: 409 })
  }

  // Active shift date (overnight shifts crossing midnight attach to the shift date)
  const shiftDate = currentShiftDate(lagos, shift)

  // Morning attendance and hourly patrol are separate activities: do not create attendance here.
  await db.update(guards)
    .set({ lastLatitude: latitude, lastLongitude: longitude })
    .where(eq(guards.id, guard.id))

  let [patrol] = await db.select().from(patrols).where(and(
    eq(patrols.organizationId, currentUser.organizationId),
    eq(patrols.guardId, guard.id),
    eq(patrols.patrolDate, shiftDate),
  )).limit(1)
  if (!patrol) {
    ;[patrol] = await db.insert(patrols).values({
      userId: currentUser.userId,
      organizationId: currentUser.organizationId,
      guardId: guard.id,
      siteId,
      loggedAt: now,
      patrolDate: shiftDate,
      latitude,
      longitude,
      method: token ? 'nfc' : 'gps',
      withinBounds: true,
      createdAt: now,
    }).onConflictDoNothing().returning()
    if (!patrol) {
      ;[patrol] = await db.select().from(patrols).where(and(
        eq(patrols.organizationId, currentUser.organizationId),
        eq(patrols.guardId, guard.id),
        eq(patrols.patrolDate, shiftDate),
      )).limit(1)
    }
  }
  if (!patrol) return NextResponse.json({ error: 'Could not open patrol record for this shift.' }, { status: 500 })

  const [checkpoint] = await db.insert(patrolCheckpoints).values({
    userId: currentUser.userId,
    organizationId: currentUser.organizationId,
    patrolId: patrol.id,
    slot,
    signedAt: now,
  }).onConflictDoNothing().returning()
  if (!checkpoint) {
    return NextResponse.json({
      error: `The ${slot} hourly patrol checkpoint has already been signed. Next hourly check is at ${String((lagos.hour + 1) % 24).padStart(2, '0')}:00.`,
    }, { status: 409 })
  }

  const checkpointRows = await db.select({ id: patrolCheckpoints.id }).from(patrolCheckpoints).where(and(
    eq(patrolCheckpoints.organizationId, currentUser.organizationId),
    eq(patrolCheckpoints.patrolId, patrol.id),
  ))
  const signedCount = checkpointRows.length
  await db.update(patrols).set({
    progress: Math.round((signedCount / Math.max(slots.length, 1)) * 100),
    status: signedCount >= slots.length ? 'completed' : 'in_progress',
  }).where(eq(patrols.id, patrol.id))

  const [todayPatrols] = await db.select({ total: count() })
    .from(patrolCheckpoints)
    .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
    .where(and(
      eq(patrolCheckpoints.organizationId, currentUser.organizationId),
      eq(patrols.guardId, guard.id),
      eq(patrols.patrolDate, shiftDate),
    ))

  return NextResponse.json({
    ok: true,
    status: await todayStatus(currentUser.organizationId, guard.id),
    action: 'patrol',
    checkedIn: true,
    guardId: guard.id,
    guardName: guard.name,
    siteName: site.name,
    withinBounds: true,
    checkpoint: slot,
    patrolCount: Number(todayPatrols?.total ?? signedCount),
    message: `Hourly patrol verified: ${guard.name} signed ${slot} stay-awake checkpoint on-site at ${site.name}.`,
    record: patrol,
  })
}
