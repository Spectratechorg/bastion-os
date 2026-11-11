import { NextResponse } from 'next/server'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  activityEvents,
  alerts,
  attendance,
  guards,
  organizations,
  patrolCheckpoints,
  patrols,
  sites,
} from '@/lib/db/schema'
import { actor, denyGuard, guardShift, isAdminRole, fail, normalizeShift, patrolSlots } from '@/lib/server'
import { newGuardAppCode } from '@/lib/guard-access'
import { cachedJsonResponse, invalidate } from '@/lib/cache'

/**
 * GET /api/admin
 * Aggregates Tier-1 Operational Command Center metrics:
 * 1. Shift Coverage Ratio (% of active sites staffed today)
 * 2. Guard Fleet Readiness (On-Duty, Late/No-Show, Suspended)
 * 3. Patrol SLA compliance (signed vs expected checkpoints)
 * 4. Critical Exceptions feed (SOS, Geofence Breaches, Low Battery)
 * 5. Site Coverage & Risk Matrix
 * 6. Guard App Shared Code & Recent Security Audit Logs
 */
export async function GET() {
  const current = await actor()
  if (!current) return fail('Unauthorized', 401)
  const denied = denyGuard(current)
  if (denied) return denied
  return cachedJsonResponse(`admin:${current.organizationId}`, 8_000, async () => {

  const orgId = current.organizationId

  // Today start in Africa/Lagos
  const now = new Date()
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0))

  try {
    const [
      orgRecord,
      allSites,
      allGuards,
      todayAttendance,
      openAlerts,
      todayCheckpoints,
      recentLogs,
    ] = await Promise.all([
      db
        .select({
          name: organizations.name,
          guardAppCode: organizations.guardAppCode,
          patrolStartHour: organizations.patrolStartHour,
          patrolEndHour: organizations.patrolEndHour,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),

      db
        .select({
          id: sites.id,
          name: sites.name,
          address: sites.address,
          latitude: sites.latitude,
          longitude: sites.longitude,
          geofenceRadius: sites.geofenceRadius,
          dangerLevel: sites.dangerLevel,
          status: sites.status,
        })
        .from(sites)
        .where(eq(sites.organizationId, orgId)),

      db
        .select({
          id: guards.id,
          name: guards.name,
          site: guards.site,
          status: guards.status,
          phone: guards.phone,
          shiftStartHour: guards.shiftStartHour,
          shiftEndHour: guards.shiftEndHour,
        })
        .from(guards)
        .where(eq(guards.organizationId, orgId)),

      db
        .select({
          id: attendance.id,
          guardId: attendance.guardId,
          siteId: attendance.siteId,
          checkedInAt: attendance.checkedInAt,
          checkedOutAt: attendance.checkedOutAt,
          withinGeofence: attendance.withinGeofence,
        })
        .from(attendance)
        .where(and(eq(attendance.organizationId, orgId), gte(attendance.checkedInAt, todayStart))),

      db
        .select({
          id: alerts.id,
          type: alerts.type,
          title: alerts.title,
          body: alerts.body,
          severity: alerts.severity,
          acknowledged: alerts.acknowledged,
          createdAt: alerts.createdAt,
        })
        .from(alerts)
        .where(and(eq(alerts.organizationId, orgId), eq(alerts.acknowledged, false)))
        .orderBy(desc(alerts.createdAt))
        .limit(20),

      db
        .select({
          id: patrolCheckpoints.id,
          slot: patrolCheckpoints.slot,
          signedAt: patrolCheckpoints.signedAt,
          patrolId: patrolCheckpoints.patrolId,
        })
        .from(patrolCheckpoints)
        .where(and(eq(patrolCheckpoints.organizationId, orgId), gte(patrolCheckpoints.signedAt, todayStart))),

      db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          title: activityEvents.title,
          body: activityEvents.body,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(eq(activityEvents.organizationId, orgId))
        .orderBy(desc(activityEvents.createdAt))
        .limit(10),
    ])

    const org = orgRecord[0] ?? {
      name: 'Bastion Security',
      guardAppCode: 'GRD-DEMO-0000',
      patrolStartHour: 8,
      patrolEndHour: 18,
    }

    // 1. Shift Readiness & Fleet Availability
    const activeGuards = allGuards.filter((g) => g.status === 'active')
    const suspendedGuards = allGuards.filter((g) => g.status === 'suspended')
    const checkedInGuardIds = new Set(
      todayAttendance.filter((a) => !a.checkedOutAt).map((a) => a.guardId)
    )
    const onDutyGuards = activeGuards.filter((g) => checkedInGuardIds.has(g.id))
    const lateOrNoShow = activeGuards.filter((g) => !checkedInGuardIds.has(g.id))

    // 2. Site Coverage Matrix
    const activeSites = allSites.filter((s) => s.status === 'active')
    const siteCoverageMatrix = activeSites.map((site) => {
      const assigned = activeGuards.filter((g) => g.site === site.name)
      const present = assigned.filter((g) => checkedInGuardIds.has(g.id))
      const coverageStatus: 'optimal' | 'understaffed' | 'vacant' =
        present.length >= Math.max(1, assigned.length)
          ? 'optimal'
          : present.length > 0
          ? 'understaffed'
          : 'vacant'

      return {
        id: site.id,
        name: site.name,
        address: site.address,
        dangerLevel: site.dangerLevel,
        status: site.status,
        geofenceRadius: site.geofenceRadius,
        assignedCount: assigned.length,
        presentCount: present.length,
        coverageStatus,
      }
    })

    const staffedSitesCount = siteCoverageMatrix.filter((s) => s.presentCount > 0).length
    const shiftCoverageRatio = activeSites.length
      ? Math.round((staffedSitesCount / activeSites.length) * 100)
      : 100

    // 3. Patrol SLA Compliance
    const companyShift = normalizeShift(org.patrolStartHour, org.patrolEndHour)
    const expectedCheckpointsCount = Math.max(1, activeGuards.reduce((total, guard) => total + patrolSlots(guardShift(guard, companyShift)).length, 0))
    const completedPatrolsCount = todayCheckpoints.length
    const patrolSla = Math.min(100, Math.round((completedPatrolsCount / expectedCheckpointsCount) * 100))

    // 4. Critical Exceptions & Breaches
    const geofenceBreaches = todayAttendance
      .filter((a) => a.withinGeofence === false)
      .map((a) => {
        const guard = allGuards.find((g) => g.id === a.guardId)
        const site = allSites.find((s) => s.id === a.siteId)
        return {
          id: `breach-${a.id}`,
          type: 'geofence',
          title: `Geofence Breach: ${guard?.name ?? 'Unknown Guard'}`,
          body: `${site?.name ?? 'Assigned site'} · Left authorized boundary`,
          severity: 'high',
          time: (a.checkedInAt ?? now).toISOString(),
        }
      })

    const alertExceptions = openAlerts.map((alt) => ({
      id: alt.id,
      type: alt.type,
      title: alt.title,
      body: alt.body,
      severity: alt.severity,
      time: alt.createdAt.toISOString(),
    }))

    const combinedExceptions = [
      ...alertExceptions,
      ...geofenceBreaches,
    ].slice(0, 8)

    return NextResponse.json({
      organization: {
        name: org.name,
        guardAppCode: org.guardAppCode,
      },
      readiness: {
        totalGuards: allGuards.length,
        activeGuards: activeGuards.length,
        onDutyCount: onDutyGuards.length,
        lateOrNoShowCount: lateOrNoShow.length,
        suspendedCount: suspendedGuards.length,
        attendanceRate: activeGuards.length ? Math.round((onDutyGuards.length / activeGuards.length) * 100) : 0,
      },
      coverage: {
        totalSites: allSites.length,
        activeSitesCount: activeSites.length,
        staffedSitesCount,
        vacantSitesCount: activeSites.length - staffedSitesCount,
        shiftCoverageRatio,
        matrix: siteCoverageMatrix,
      },
      sla: {
        completedPatrols: completedPatrolsCount,
        expectedPatrols: expectedCheckpointsCount,
        patrolSlaPercent: patrolSla,
      },
      exceptions: combinedExceptions,
      auditLogs: recentLogs,
    })
  } catch (err) {
    console.error('[Admin API] Failed to aggregate metrics:', err)
    return fail('Could not load admin command center data.', 500)
  }
  })
}

/**
 * POST /api/admin
 * Executes Tier-1 supervisor rapid actions:
 * - `rotate-code`: Generates and updates a new guard app shared access code.
 * - `broadcast-alert`: Emits a high-priority tactical alert to all supervisors.
 * - `acknowledge-alert`: Clears an open exception.
 */
export async function POST(request: Request) {
  const current = await actor()
  if (!current) return fail('Unauthorized', 401)
  const denied = denyGuard(current)
  if (denied) return denied
  invalidate(`admin:${current.organizationId}:`); invalidate(`ops:${current.organizationId}:`); invalidate(`patrols:${current.organizationId}:`)

  let body: { action: string; [key: string]: unknown }
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body')
  }

  const { action } = body

  // 1. Rotate Guard App Access Code (Admins/Owners)
  if (action === 'rotate-code') {
    if (!isAdminRole(current.role)) return fail('Access restricted to administrators and owners.', 403)
    const freshCode = newGuardAppCode()
    await db
      .update(organizations)
      .set({ guardAppCode: freshCode })
      .where(eq(organizations.id, current.organizationId))

    await db.insert(activityEvents).values({
      organizationId: current.organizationId,
      userId: current.userId,
      type: 'security_code_rotated',
      title: 'Guard App Access Code Rotated',
      body: `New code ${freshCode} generated. All previously connected devices require new verification.`,
      tone: 'warning',
      createdAt: new Date(),
    })

    return NextResponse.json({ ok: true, code: freshCode })
  }

  // 2. Broadcast High-Priority Dispatch Alert (Admins/Owners)
  if (action === 'broadcast-alert') {
    if (!isAdminRole(current.role)) return fail('Access restricted to administrators and owners.', 403)
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Tactical Alert'
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Operational broadcast'

    const [created] = await db
      .insert(alerts)
      .values({
        organizationId: current.organizationId,
        userId: current.userId,
        type: 'broadcast',
        title,
        body: message,
        severity: 'high',
        acknowledged: false,
        createdAt: new Date(),
      })
      .returning()

    await db.insert(activityEvents).values({
      organizationId: current.organizationId,
      userId: current.userId,
      type: 'alert_broadcast',
      title: `Broadcast Dispatched: ${title}`,
      body: message,
      tone: 'urgent',
      createdAt: new Date(),
    })

    return NextResponse.json({ ok: true, alert: created })
  }

  // 3. Acknowledge Exception Alert
  if (action === 'acknowledge-alert') {
    const id = body.id as string
    if (!id || typeof id !== 'string') return fail('Missing alert id')

    await db
      .update(alerts)
      .set({ acknowledged: true })
      .where(and(eq(alerts.id, id), eq(alerts.organizationId, current.organizationId)))

    return NextResponse.json({ ok: true })
  }

  return fail('Unknown action')
}
