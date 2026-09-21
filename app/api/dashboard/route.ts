import { NextResponse } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alerts, activityEvents, attendance, guards, incidents } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [guardRows, incidentRows, alertRows, activityRows, attendanceRows, counts] = await Promise.all([
    db.select().from(guards).orderBy(desc(guards.lastCheckIn)).limit(8),
    db.select().from(incidents).where(eq(incidents.status, 'open')).orderBy(desc(incidents.reportedAt)).limit(5),
    db.select().from(alerts).where(eq(alerts.acknowledged, false)).orderBy(desc(alerts.createdAt)).limit(5),
    db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(8),
    db.select().from(attendance).orderBy(desc(attendance.checkedInAt)).limit(100),
    db.select({ total: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${guards.status} = 'active')` }).from(guards),
  ])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayAttendance = attendanceRows.filter((row) => row.checkedInAt >= today).length
  return NextResponse.json({ guards: guardRows, incidents: incidentRows, alerts: alertRows, activities: activityRows, kpis: { activeGuards: Number(counts[0]?.active ?? 0), registeredGuards: Number(counts[0]?.total ?? 0), attendanceRate: todayAttendance ? Math.round((todayAttendance / Math.max(Number(counts[0]?.total ?? 1), 1)) * 1000) / 10 : 0, openIncidents: incidentRows.length, unacknowledgedAlerts: alertRows.length } })
}
