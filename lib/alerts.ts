import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alerts, members, users } from '@/lib/db/schema'
import { alertEmail, sendMail } from '@/lib/email'

export type AlertType = 'sos' | 'geofence' | 'incident' | 'patrol' | 'attendance'
export { ALERT_RULES } from '@/lib/alerts-client'

/** Insert an alert once. `key` makes repeated calls idempotent (e.g. one missed-patrol alert per guard per day). */
export async function raiseAlert(a: { userId: string; organizationId: string; type: AlertType; title: string; body: string; severity: 'low' | 'medium' | 'high' | 'critical'; key?: string }) {
  const [inserted] = await db.insert(alerts).values({ userId: a.userId, organizationId: a.organizationId, type: a.type, title: a.title, body: a.body, severity: a.severity, acknowledged: false, dedupeKey: a.key ?? null, createdAt: new Date() }).onConflictDoNothing().returning({ id: alerts.id })
  if (!inserted) return null

  // High and critical alerts are also emailed to the people who can act on them.
  if (a.severity !== 'high' && a.severity !== 'critical') return inserted.id
  try {
    const recipients = await db.select({ email: users.email }).from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.organizationId, a.organizationId), inArray(members.role, ['owner', 'admin', 'moderator'])))
    await Promise.allSettled(recipients.slice(0, 20).map((recipient) => sendMail(alertEmail({ to: recipient.email, severity: a.severity, title: a.title, body: a.body }))))
  } catch (error) {
    console.warn('[Alerts] Could not deliver alert email:', error)
  }
  return inserted.id
}
