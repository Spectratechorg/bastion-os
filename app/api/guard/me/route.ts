import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guards, sites } from '@/lib/db/schema'
import { todayStatus } from '@/lib/guard-today'
import { actor, fail } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** The guard record linked to the signed-in login, with today's check-in, assigned site details, and live geofence status. */
export async function GET() {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  const [guard] = await db.select({
    id: guards.id,
    name: guards.name,
    guardCode: guards.guardCode,
    nin: guards.nin,
    site: guards.site,
    photoUrl: guards.photoUrl,
    status: guards.status,
    lastLatitude: guards.lastLatitude,
    lastLongitude: guards.lastLongitude,
  }).from(guards)
    .where(and(eq(guards.organizationId, current.organizationId), eq(guards.loginUserId, current.userId))).limit(1)

  if (!guard) {
    const status = await todayStatus(current.organizationId, '00000000-0000-0000-0000-000000000000')
    return NextResponse.json({ linked: false, role: current.role, ...status })
  }

  const [assignedSite, status] = await Promise.all([
    guard.site
      ? db.select({
        id: sites.id,
        name: sites.name,
        latitude: sites.latitude,
        longitude: sites.longitude,
        geofenceRadius: sites.geofenceRadius,
      }).from(sites).where(and(eq(sites.organizationId, current.organizationId), eq(sites.name, guard.site), eq(sites.status, 'active'))).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    todayStatus(current.organizationId, guard.id),
  ])

  return NextResponse.json({
    linked: true,
    role: current.role,
    guard,
    assignedSite,
    ...status,
  })
}
