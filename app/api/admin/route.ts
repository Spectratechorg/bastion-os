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
import { actor, isAdminRole, fail } from '@/lib/server'
import { newGuardAppCode } from '@/lib/guard-access'

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
  if (!isAdminRole(current.role)) return fail('Access restricted to administrators and owners.', 403)

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
          dangerLevel: sites.dangerLevel,
          status: sites.status,
          geofenceRadius: sites.geofenceRadius,
        })
        .from(sites)
        .where(eq(sites.organizationId, orgId)),

      db
        .select({
          id: guards.id,
          name: guards.name,
          status: guards.status,
          site: guards.site,
          lastCheckIn: guards.lastCheckIn,
          phone: guards.phone,
        })
        .from(guards)
        .where(eq(guards.organizationId, orgId)),

      db
        .select({
          id: attendance.id,
          guardId: attendance.guardId,
          siteId: attendance.siteId,
          checkedInAt: attendance.checkedInAt,
          withinGeofence: attendance.withinGeofence,
          latitude: attendance.latitude,
          longitude: attendance.longitude,
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
        .limit(10),

      db
        .select({
          id: patrolCheckpoints.id,
          slot: patrolCheckpoints.slot,
          signedAt: patrolCheckpoints.signedAt,
        })
        .from(patrolCheckpoints)
        .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
        .where(and(eq(patrols.organizationId, orgId), gte(patrolCheckpoints.signedAt, todayStart))),

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
        .limit(8),
    ])

    const org = orgRecord[0] ?? { name: 'Security Org', guardAppCode: 'GRD-NONE-0000' }

    // 1. Compute Guard Fleet Readiness
    const activeGuards = allGuards.filter((g) => g.status === 'active')
    const suspendedGuards = allGuards.filter((g) => g.status === 'suspended')
    const checkedInGuardIds = new Set(todayAttendance.map((a) => a.guardId))
    const onDutyGuards = activeGuards.filter((g) => checkedInGuardIds.has(g.id))
    const lateOrNoShow = activeGuards.filter((g) => !checkedInGuardIds.has(g.id))

    // 2. Compute Site Coverage Matrix
    const activeSites = allSites.filter((s) => s.status !== 'inactive')
    const siteCoverageMatrix = activeSites.map((s) => {
      const assignedCrew = allGuards.filter((g) => g.site === s.name && g.status === 'active')
      const presentCrew = assignedCrew.filter((g) => checkedInGuardIds.has(g.id))
      const coverageStatus =
        presentCrew.length >= Math.max(1, assignedCrew.length)
          ? 'optimal'
          : presentCrew.length > 0
          ? 'understaffed'
          : 'vacant'

      return {
        ...s,
        assignedCount: assignedCrew.length,
        presentCount: presentCrew.length,
        coverageStatus,
      }
    })

    const staffedSitesCount = siteCoverageMatrix.filter((s) => s.presentCount > 0).length
    const shiftCoverageRatio =
      activeSites.length > 0 ? Math.round((staffedSitesCount / activeSites.length) * 100) : 100

    // 3. Compute Patrol SLA
    const completedPatrolsCount = todayCheckpoints.length
    // Assume expected 8-10 checkpoints per staffed site
    const expectedCheckpointsCount = Math.max(1, staffedSitesCount * 8)
    const patrolSla = Math.min(100, Math.round((completedPatrolsCount / expectedCheckpointsCount) * 100))

    // 4. Critical Exceptions
    // Include geofence breaches detected in attendance today
    const geofenceBreaches = todayAttendance
      .filter((a) => a.withinGeofence === false)
      .map((a) => {
        const guard = allGuards.find((g) => g.id === a.guardId)
        return {
          id: `breach-${a.id}`,
          type: 'geofence_breach',
          title: `Geofence Breach: ${guard?.name ?? 'Guard'}`,
          body: `Scan occurred outside authorized perimeter (Lat: ${a.latitude.toFixed(4)}, Lng: ${a.longitude.toFixed(4)})`,
          severity: 'high',
          time: a.checkedInAt,
        }
      })

    const combinedExceptions = [
      ...openAlerts.map((al) => ({
        id: al.id,
        type: al.type,
        title: al.title,
        body: al.body,
        severity: al.severity,
        time: al.createdAt,
      })),
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
  if (!isAdminRole(current.role)) return fail('Access restricted to administrators.', 403)

  let body: { action: string; [key: string]: unknown }
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body')
  }

  const { action } = body

  // 1. Rotate Guard App Access Code
  if (action === 'rotate-code') {
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

  // 2. Broadcast High-Priority Dispatch Alert
  if (action === 'broadcast-alert') {
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
