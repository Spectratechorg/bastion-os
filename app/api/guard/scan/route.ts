import { NextResponse } from 'next/server'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, guards, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { organizationForGuardAppCode, ownerUserId } from '@/lib/guard-access'
import { lagosParts, slotForHour } from '@/lib/server'

export const dynamic = 'force-dynamic'

const scanSchema = z.object({
  type: z.enum(['attendance', 'patrol']),
  token: z.string().trim().min(1).max(200),
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
  if (!token) return NextResponse.json({ error: 'A registered NFC token is required.' }, { status: 400 })

  const [guard] = await db
    .select()
    .from(guards)
    .where(and(
      eq(guards.organizationId, currentUser.organizationId),
      eq(guards.nfcToken, token),
    ))
    .limit(1)

  if (!guard) {
    return NextResponse.json({ error: 'This NFC token is not registered for your active organization.' }, { status: 404 })
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
        .set({ checkedOutAt: now })
        .where(eq(attendance.id, activeAttendance.id))

      return NextResponse.json({
        ok: true,
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

    return NextResponse.json({
      ok: true,
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
  const slot = slotForHour(lagos.hour)
  if (!slot) return NextResponse.json({ error: 'Patrol checkpoints can only be signed between 09:00 and 12:59 Lagos time.' }, { status: 409 })

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
    progress: Math.round((signedCount / 3) * 100),
    status: signedCount === 3 ? 'completed' : 'in_progress',
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
