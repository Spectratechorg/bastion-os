import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { members } from '@/lib/db/schema'

export type Actor = { userId: string; organizationId: string }

/** Signed-in user plus their active organization, or null. */
export async function actor(): Promise<Actor | null> {
  const current = await getActiveOrganization()
  return current?.organizationId ? { userId: current.userId, organizationId: current.organizationId } : null
}

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

/** Only owners, admins and moderators may approve payroll. */
export async function isModerator(current: Actor) {
  const [membership] = await db.select({ role: members.role }).from(members).where(and(
    eq(members.organizationId, current.organizationId),
    eq(members.userId, current.userId),
  )).limit(1)
  return membership?.role.split(',').some((role) => ['owner', 'admin', 'moderator'].includes(role.trim())) ?? false
}

const zone = 'Africa/Lagos'
/** Date (YYYY-MM-DD) and hour in Lagos time. */
export function lagosParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), month: `${parts.year}-${parts.month}` }
}

export { PATROL_SLOTS, PATROL_WINDOW, slotForHour } from '@/lib/server-rules'

export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (value: number) => (value * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
