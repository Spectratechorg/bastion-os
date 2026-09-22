import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, desc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alerts, activityEvents, attendance, guards, incidents } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const [guardRows, incidentRows, alertRows, activityRows, attendanceRows, counts] = await Promise.all([
    db.select().from(guards).where(eq(guards.userId, userId)).orderBy(desc(guards.lastCheckIn)).limit(8),
    db.select().from(incidents).where(and(eq(incidents.userId, userId), eq(incidents.status, 'open'))).orderBy(desc(incidents.reportedAt)).limit(5),
    db.select().from(alerts).where(and(eq(alerts.userId, userId), eq(alerts.acknowledged, false))).orderBy(desc(alerts.createdAt)).limit(5),
    db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.createdAt)).limit(8),
    db.select().from(attendance).where(eq(attendance.userId, userId)).orderBy(desc(attendance.checkedInAt)).limit(100),
    db.select({ total: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${guards.status} = 'active')` }).from(guards).where(eq(guards.userId, userId)),
  ])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayAttendance = attendanceRows.filter((row) => row.checkedInAt >= today).length
  return NextResponse.json({ guards: guardRows, incidents: incidentRows, alerts: alertRows, activities: activityRows, kpis: { activeGuards: Number(counts[0]?.active ?? 0), registeredGuards: Number(counts[0]?.total ?? 0), attendanceRate: todayAttendance ? Math.round((todayAttendance / Math.max(Number(counts[0]?.total ?? 1), 1)) * 1000) / 10 : 0, openIncidents: incidentRows.length, unacknowledgedAlerts: alertRows.length } })
}
