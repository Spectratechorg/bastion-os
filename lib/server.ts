import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

export type Actor = { userId: string; organizationId: string }

/** Signed-in user plus their active organization, or null. */
export async function actor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const organizationId = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  return session?.user && organizationId ? { userId: session.user.id, organizationId } : null
}

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

/** Only owners, admins and moderators may approve payroll. */
export async function isModerator(current: Actor) {
  try {
    const result = await pool.query('select role from member where "organizationId" = $1 and "userId" = $2 limit 1', [current.organizationId, current.userId])
    const roles = String(result.rows[0]?.role ?? '').split(',').map((role) => role.trim())
    return roles.some((role) => ['owner', 'admin', 'moderator'].includes(role))
  } catch {
    return false
  }
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
