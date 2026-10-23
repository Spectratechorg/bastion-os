import { db } from '@/lib/db'
import { alerts } from '@/lib/db/schema'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Alerts are created by the system, never typed by hand. Each one records the rule that fired:
 * - geofence breach (a scan outside the site radius) -> high, critical after 3 breaches in a day
 * - incident reported as critical, or escalated -> matches the incident severity
 * - guard SOS from the phone -> critical
 * - patrol shift ended with missed checkpoints -> medium
 */
export async function raiseAlert(input: {
  userId: string
  organizationId: string
  type: string
  title: string
  body: string
  severity: AlertSeverity
}) {
  const [row] = await db.insert(alerts).values({ ...input, acknowledged: false, createdAt: new Date() }).returning()
  return row
}
