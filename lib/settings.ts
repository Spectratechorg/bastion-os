import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orgSettings } from '@/lib/db/schema'

export type OrgSettings = { phone: string; address: string; defaultGeofence: number; defaultSalary: number }
export const DEFAULT_SETTINGS: OrgSettings = { phone: '', address: '', defaultGeofence: 100, defaultSalary: 150000 }

export async function getSettings(organizationId: string): Promise<OrgSettings> {
  try {
    const [row] = await db.select({ data: orgSettings.data }).from(orgSettings).where(eq(orgSettings.organizationId, organizationId)).limit(1)
    return { ...DEFAULT_SETTINGS, ...((row?.data as Partial<OrgSettings> | undefined) ?? {}) }
  } catch { return DEFAULT_SETTINGS }
}
