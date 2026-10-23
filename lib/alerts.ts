import { db } from '@/lib/db'
import { alerts } from '@/lib/db/schema'

export type AlertType = 'sos' | 'geofence' | 'incident' | 'patrol'
export { ALERT_RULES } from '@/lib/alerts-client'

/** Insert an alert once. `key` makes repeated calls idempotent (e.g. one missed-patrol alert per guard per day). */
export async function raiseAlert(a: { userId: string; organizationId: string; type: AlertType; title: string; body: string; severity: 'low' | 'medium' | 'high' | 'critical'; key?: string }) {
  await db.insert(alerts).values({ userId: a.userId, organizationId: a.organizationId, type: a.type, title: a.title, body: a.body, severity: a.severity, acknowledged: false, dedupeKey: a.key ?? null, createdAt: new Date() }).onConflictDoNothing()
}
