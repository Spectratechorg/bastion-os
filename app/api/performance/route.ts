import { and, eq, gte, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { attendance, guards, patrols, sites } from '@/lib/db/schema'
import { actor, fail, lagosParts } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** Per-guard attendance and patrol rates for a month, plus site coverage counts. */
export async function GET(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in and select an organization.', 401)

  const now = lagosParts()
  const period = new URL(request.url).searchParams.get('period') ?? now.month
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('Period must look like 2026-10')
  const [year, month] = period.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const first = `${period}-01`
  const lastDay = `${period}-${String(daysInMonth).padStart(2, '0')}`
  const upTo = now.date < lastDay ? now.date : lastDay
  const from = new Date(Date.UTC(year, month - 1, 1) - 3600000)
  const to = new Date(Date.UTC(year, month, 1))

  const [guardRows, siteRows, attendanceRows, patrolRows] = await Promise.all([
    db.select().from(guards).where(eq(guards.organizationId, current.organizationId)),
    db.select().from(sites).where(eq(sites.organizationId, current.organizationId)),
    db.select({ guardId: attendance.guardId, at: attendance.checkedInAt, withinGeofence: attendance.withinGeofence })
      .from(attendance).where(and(eq(attendance.organizationId, current.organizationId), gte(attendance.checkedInAt, from), lt(attendance.checkedInAt, to))),
    db.select({ guardId: patrols.guardId, status: patrols.status, setDate: patrols.patrolDate })
      .from(patrols).where(and(eq(patrols.organizationId, current.organizationId), gte(patrols.loggedAt, from), lt(patrols.loggedAt, to))),
  ])

  const presentDays = new Map<string, Set<string>>()
  const breaches = new Map<string, number>()
  for (const row of attendanceRows) {
    const day = lagosParts(row.at).date
    if (day < first || day > upTo) continue
    if (!presentDays.has(row.guardId)) presentDays.set(row.guardId, new Set())
    presentDays.get(row.guardId)!.add(day)
    if (!row.withinGeofence) breaches.set(row.guardId, (breaches.get(row.guardId) ?? 0) + 1)
  }

  const completedPatrols = new Map<string, Set<string>>()
  for (const row of patrolRows) {
    const day = row.setDate ?? ''
    if (!day || day < first || day > upTo || row.status !== 'completed') continue
    if (!completedPatrols.has(row.guardId)) completedPatrols.set(row.guardId, new Set())
    completedPatrols.get(row.guardId)!.add(day)
  }

  const rate = (value: number, counted: number) => counted ? Math.round((value / counted) * 100) : 0
  const rows = guardRows.map((guard) => {
    const created = lagosParts(guard.createdAt).date
    const start = created > first ? created : first
    const daysCounted = start > upTo ? 0 : Number(upTo.slice(8)) - Number(start.slice(8)) + 1
    const daysPresent = presentDays.get(guard.id)?.size ?? 0
    const completed = completedPatrols.get(guard.id)?.size ?? 0
    return {
      guardId: guard.id,
      name: guard.name,
      photoUrl: guard.photoUrl,
      site: guard.site,
      status: guard.status,
      monthlySalary: guard.monthlySalary,
      daysCounted,
      daysPresent,
      daysAbsent: Math.max(daysCounted - daysPresent, 0),
      attendanceRate: rate(daysPresent, daysCounted),
      completedPatrols: completed,
      patrolRate: rate(completed, daysCounted),
      geofenceBreaches: breaches.get(guard.id) ?? 0,
      lastCheckIn: guard.lastCheckIn,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const coverage = siteRows.map((site) => {
    const assigned = guardRows.filter((guard) => guard.site === site.name && guard.status === 'active')
    return { siteId: site.id, name: site.name, status: site.status, guardCount: assigned.length, guardNames: assigned.map((guard) => guard.name).slice(0, 4) }
  })

  return NextResponse.json({ period, upTo, rows, coverage })
}
