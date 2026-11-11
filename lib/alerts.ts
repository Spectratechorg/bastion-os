import { db } from '@/lib/db'
import { alerts } from '@/lib/db/schema'
import { alertEmail } from '@/lib/email'
import { notifyOrganization } from '@/lib/notifications'

export type AlertType = 'sos' | 'geofence' | 'incident' | 'patrol' | 'attendance' | 'manual'
export { ALERT_RULES } from '@/lib/alerts-client'

/** Insert an alert once. `key` makes repeated calls idempotent (e.g. one missed-patrol alert per guard per day). */
export async function raiseAlert(a: { userId: string; organizationId: string; type: AlertType; title: string; body: string; severity: 'low' | 'medium' | 'high' | 'critical'; key?: string; notify?: boolean }) {
  const [inserted] = await db.insert(alerts).values({ userId: a.userId, organizationId: a.organizationId, type: a.type, title: a.title, body: a.body, severity: a.severity, acknowledged: false, dedupeKey: a.key ?? null, createdAt: new Date() }).onConflictDoNothing().returning({ id: alerts.id })
  if (!inserted) return null

  // Operational alerts are also emailed to the people who can act on them; low-priority chatter stays in-app.
  if (a.notify === false || a.severity === 'low') return inserted.id
  try {
    await notifyOrganization(a.organizationId, (email) => alertEmail({ to: email, severity: a.severity, title: a.title, body: a.body }))
  } catch (error) {
    console.warn('[Alerts] Could not deliver alert email:', error)
  }
  return inserted.id
}
