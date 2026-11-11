import { eq } from 'drizzle-orm'
import { cached } from '@/lib/cache'
import { db } from '@/lib/db'
import { orgSettings } from '@/lib/db/schema'
import { invalidate } from '@/lib/cache'

export type OrgSettings = { phone: string; address: string; defaultGeofence: number; defaultSalary: number; notificationPrefs?: Record<string, boolean> }
export const DEFAULT_SETTINGS: OrgSettings = { phone: '', address: '', defaultGeofence: 100, defaultSalary: 150000 }

export async function getSettings(organizationId: string): Promise<OrgSettings> {
  return cached(`settings:${organizationId}`, 30_000, async () => {
    try {
      const [row] = await db.select({ data: orgSettings.data }).from(orgSettings).where(eq(orgSettings.organizationId, organizationId)).limit(1)
      return { ...DEFAULT_SETTINGS, ...((row?.data as Partial<OrgSettings> | undefined) ?? {}) }
    } catch { return DEFAULT_SETTINGS }
  })
}

/** Per-user email preference: incidents-only recipients skip alert and attendance mail. */
export async function setIncidentOnly(organizationId: string, userId: string, incidentsOnly: boolean) {
  const current = await getSettings(organizationId)
  const notificationPrefs = { ...(current.notificationPrefs ?? {}) }
  if (incidentsOnly) notificationPrefs[userId] = true
  else delete notificationPrefs[userId]
  await db.insert(orgSettings).values({ organizationId, data: { ...current, notificationPrefs } }).onConflictDoUpdate({ target: orgSettings.organizationId, set: { data: { ...current, notificationPrefs } } })
  invalidate(`settings:${organizationId}`)
}
