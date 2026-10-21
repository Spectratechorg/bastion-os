import { NextResponse } from 'next/server'
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, guards, patrols, sites } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const scanSchema = z.object({
  type: z.enum(['attendance', 'patrol']),
  token: z.string().trim().min(1).max(200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
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

  const currentUser = await getActiveOrganization()
  if (!currentUser) return NextResponse.json({ error: 'Sign in before scanning a guard tag.' }, { status: 401 })
  if (!currentUser.organizationId) {
    return NextResponse.json({ error: 'No active organization membership. Select an organization before scanning tags.' }, { status: 403 })
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

  const [record] = await db.insert(patrols).values({
    userId: currentUser.userId,
    organizationId: currentUser.organizationId,
    guardId: guard.id,
    siteId,
    loggedAt: now,
    latitude,
    longitude,
    method: 'nfc',
    withinBounds,
    createdAt: now,
  }).returning()
  const [todayPatrols] = await db.select({ total: count() })
    .from(patrols)
    .where(and(
      eq(patrols.organizationId, currentUser.organizationId),
      eq(patrols.guardId, guard.id),
      gte(patrols.loggedAt, new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    ))

  return NextResponse.json({
    ok: true,
    action: 'patrol',
    checkedIn: true,
    guardId: guard.id,
    guardName: guard.name,
    siteName: site?.name ?? null,
    withinBounds,
    patrolCount: Number(todayPatrols?.total ?? 0),
    message: `Patrol checkpoint recorded for ${guard.name}${site ? ` at ${site.name}` : ''}.`,
    record,
  })
}
