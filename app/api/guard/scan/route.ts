import { NextResponse } from 'next/server'
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { raiseAlert } from '@/lib/alerts'
import { organizationForGuardAppCode, ownerUserId } from '@/lib/guard-access'
import { todayStatus } from '@/lib/guard-today'
import { lagosParts, memberRole, normalizeShift, patrolSlots, slotForHour } from '@/lib/server'

export const dynamic = 'force-dynamic'

const scanSchema = z.object({
  type: z.enum(['attendance', 'patrol', 'sos']),
  /** Optional for a guard signed in with their own login: their linked record is used. */
  token: z.string().trim().max(200).default(''),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  /** Shared guard-app code, used by phones that are not signed in. */
  code: z.string().trim().max(64).optional(),
})

function isWithinSite(latitude: number, longitude: number, site: typeof sites.$inferSelect) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_000
  const deltaLatitude = radians(site.latitude - latitude)
  const deltaLongitude = radians(site.longitude - longitude)
  const distance = 2 * earthRadiusMeters * Math.asin(Math.sqrt(
    Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(radians(latitude)) * Math.cos(radians(site.latitude)) * Math.sin(deltaLongitude / 2) ** 2,
  ))
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

  const { type, latitude, longitude } = parsed.data
  const token = parsed.data.token.replace(/^nfc:/i, '').trim()
  // A guard signed in with their own login can only act as their linked guard record.
  const linkedGuardId = session?.organizationId && currentUser.userId === session.userId && (await memberRole(currentUser.organizationId, currentUser.userId)) === 'guard'
    ? (await db.select({ id: guards.id }).from(guards).where(and(eq(guards.organizationId, currentUser.organizationId), eq(guards.loginUserId, currentUser.userId))).limit(1))[0]?.id ?? 'none'
    : null
  if (!token && !linkedGuardId) return NextResponse.json({ error: 'Tap your NFC tag or type its code to continue.' }, { status: 400 })

  const [guard] = await db
    .select()
    .from(guards)
    .where(and(
      eq(guards.organizationId, currentUser.organizationId),
      linkedGuardId && !token ? eq(guards.id, linkedGuardId) : eq(guards.nfcToken, token),
    ))
    .limit(1)

  if (!guard) {
    if (!token) return NextResponse.json({ error: 'Tap your NFC tag or type its code to continue.' }, { status: 400 })
    // The code may belong to a guard in another organization in the same database. Say so, rather than
    // reporting a plain mismatch, because the fix is completely different (sign in as the right account).
    const [elsewhere] = await db.select({ id: guards.id }).from(guards).where(eq(guards.nfcToken, token)).limit(1)
    if (elsewhere) {
      return NextResponse.json({
        error: `This tag is registered to a guard in a different organization (code ${token}). Sign in, or enter the guard app code, for the organization that registered this guard.`,
      }, { status: 409 })
    }
    return NextResponse.json({
      error: `No guard anywhere in this database has the tag code this tag holds (${token}). The guard was probably deleted after the tag was written, or the tag was replaced. Open Guards, compare the NFC tag column, and write the current code to the tag again.`,
    }, { status: 404 })
  }
  if (linkedGuardId && guard.id !== linkedGuardId) return NextResponse.json({ error: 'This tag belongs to another guard. Use your own tag.' }, { status: 403 })
  if (guard.status === 'suspended') return NextResponse.json({ error: `${guard.name} is suspended and cannot check in or patrol.` }, { status: 403 })

  if (type === 'sos') {
    await raiseAlert({ userId: currentUser.userId, organizationId: currentUser.organizationId, type: 'sos', title: 'SOS activated', body: `${guard.name} at ${guard.site ?? 'an unassigned site'} needs help (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`, severity: 'critical', key: `sos:${guard.id}:${Math.floor(Date.now() / 60000)}` })
    await db.update(guards).set({ lastLatitude: latitude, lastLongitude: longitude }).where(eq(guards.id, guard.id))
    return NextResponse.json({ ok: true, action: 'sos', guardId: guard.id, guardName: guard.name, message: 'SOS sent. Your supervisor has been alerted.' })
  }

  const site = guard.site
    ? (await db.select().from(sites).where(and(
      eq(sites.organizationId, currentUser.organizationId),
      eq(sites.name, guard.site),
      eq(sites.status, 'active'),
    )).limit(1))[0]
    : undefined
  if (!site) {
    return NextResponse.json({ error: 'This guard has no active assigned site. Assign the guard to an active site before scanning.' }, { status: 409 })
  }
  const withinBounds = isWithinSite(latitude, longitude, site)
  const now = new Date()
  const siteId = site.id

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
        message: `Checked out ${guard.name}${site ? ` at ${site.name}` : ''}.`,
      })
    }

    const [record] = await db.insert(attendance).values({
      userId: currentUser.userId,
      organizationId: currentUser.organizationId,
      guardId: guard.id,
      siteId,
      checkedInAt: now,
      latitude,
      longitude,
      method: 'nfc',
      withinGeofence: withinBounds,
      createdAt: now,
    }).returning()

    await db.update(guards)
      .set({ lastCheckIn: now, lastLatitude: latitude, lastLongitude: longitude })
      .where(eq(guards.id, guard.id))
    if (!withinBounds) await raiseAlert({ userId: currentUser.userId, organizationId: currentUser.organizationId, type: 'geofence', title: 'Outside geofence', body: `${guard.name} checked in outside ${site.name}`, severity: 'high', key: `geofence:${record.id}` })

    if (!withinBounds) await raiseBreachAlert(currentUser, guard, site, siteId)

    return NextResponse.json({
      ok: true,
      status: await todayStatus(currentUser.organizationId, guard.id),
      action: 'attendance',
      checkedIn: true,
      guardId: guard.id,
      guardName: guard.name,
      siteName: site?.name ?? null,
      withinBounds,
      message: `Checked in ${guard.name}${site ? ` at ${site.name}` : ''}.`,
      record,
    })
  }

  const lagos = lagosParts(now)
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, currentUser.organizationId)).limit(1)
  const shift = normalizeShift(organization?.startHour, organization?.endHour)
  const slots = patrolSlots(shift)
  const slot = slotForHour(lagos.hour, shift)
  if (!slot) return NextResponse.json({ error: `Patrol checkpoints can only be signed between ${String(shift.startHour).padStart(2, '0')}:00 and ${String(shift.endHour - 1).padStart(2, '0')}:59 Lagos time. Ask your supervisor to change the patrol shift in Settings.` }, { status: 409 })

  let [patrol] = await db.select().from(patrols).where(and(
    eq(patrols.organizationId, currentUser.organizationId),
    eq(patrols.guardId, guard.id),
    eq(patrols.patrolDate, lagos.date),
  )).limit(1)
  if (!patrol) {
    ;[patrol] = await db.insert(patrols).values({
      userId: currentUser.userId,
      organizationId: currentUser.organizationId,
      guardId: guard.id,
      siteId,
      loggedAt: now,
      patrolDate: lagos.date,
      latitude,
      longitude,
      method: 'nfc',
      withinBounds,
      createdAt: now,
    }).onConflictDoNothing().returning()
    if (!patrol) {
      ;[patrol] = await db.select().from(patrols).where(and(
        eq(patrols.organizationId, currentUser.organizationId),
        eq(patrols.guardId, guard.id),
        eq(patrols.patrolDate, lagos.date),
      )).limit(1)
    }
  }
  if (!patrol) return NextResponse.json({ error: 'Could not open today’s patrol record.' }, { status: 500 })

  const [checkpoint] = await db.insert(patrolCheckpoints).values({
    userId: currentUser.userId,
    organizationId: currentUser.organizationId,
    patrolId: patrol.id,
    slot,
    signedAt: now,
  }).onConflictDoNothing().returning()
  if (!checkpoint) return NextResponse.json({ error: `The ${slot} checkpoint has already been signed today.` }, { status: 409 })

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
      eq(patrols.patrolDate, lagos.date),
    ))

  return NextResponse.json({
    ok: true,
    status: await todayStatus(currentUser.organizationId, guard.id),
    action: 'patrol',
    checkedIn: true,
    guardId: guard.id,
    guardName: guard.name,
    siteName: site?.name ?? null,
    withinBounds,
    checkpoint: slot,
    patrolCount: Number(todayPatrols?.total ?? 0),
    message: `Patrol checkpoint recorded for ${guard.name}${site ? ` at ${site.name}` : ''}.`,
    record: patrol,
  })
}
