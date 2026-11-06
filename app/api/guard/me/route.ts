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
    site: guards.site,
    photoUrl: guards.photoUrl,
    status: guards.status,
    lastLatitude: guards.lastLatitude,
    lastLongitude: guards.lastLongitude,
  }).from(guards)
    .where(and(eq(guards.organizationId, current.organizationId), eq(guards.loginUserId, current.userId))).limit(1)

  if (!guard) {
    const { slots, shift, today, hour } = await todayStatus(current.organizationId, '00000000-0000-0000-0000-000000000000')
    return NextResponse.json({ linked: false, role: current.role, today, hour, slots, shift })
  }

  let assignedSite: { id: string; name: string; latitude: number; longitude: number; geofenceRadius: number } | null = null
  if (guard.site) {
    const [foundSite] = await db.select({
      id: sites.id,
      name: sites.name,
      latitude: sites.latitude,
      longitude: sites.longitude,
      geofenceRadius: sites.geofenceRadius,
    }).from(sites).where(and(eq(sites.organizationId, current.organizationId), eq(sites.name, guard.site), eq(sites.status, 'active'))).limit(1)
    assignedSite = foundSite ?? null
  }

  const status = await todayStatus(current.organizationId, guard.id)

  return NextResponse.json({
    linked: true,
    role: current.role,
    guard,
    assignedSite,
    ...status,
  })
}
