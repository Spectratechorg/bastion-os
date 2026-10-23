import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { members, rolePermissions } from '@/lib/db/schema'
import { DEFAULT_PERMISSIONS, type PermissionKey } from '@/lib/permissions'

export type Actor = { userId: string; organizationId: string; role: string }

export const ROLES = ['owner', 'admin', 'moderator', 'member', 'guard'] as const

/** Highest-privilege role the user holds in the organization, or null when they are not a member. */
export async function memberRole(organizationId: string, userId: string): Promise<string | null> {
  const [membership] = await db.select({ role: members.role }).from(members).where(and(eq(members.organizationId, organizationId), eq(members.userId, userId))).limit(1)
  if (!membership) return null
  const held = membership.role.split(',').map((role) => role.trim()).filter(Boolean)
  return ROLES.find((role) => held.includes(role)) ?? held[0] ?? 'member'
}

/** Signed-in user plus their active organization and role, or null. */
export async function actor(): Promise<Actor | null> {
  const current = await getActiveOrganization()
  if (!current?.organizationId) return null
  const role = await memberRole(current.organizationId, current.userId)
  return role ? { userId: current.userId, organizationId: current.organizationId, role } : null
}

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

/** Guards are limited to the guard app. Returns an error response for them, otherwise null. */
export const denyGuard = (current: Actor) => (current.role === 'guard' ? fail('Guard accounts can only use the guard app.', 403) : null)
/** Only owners and administrators manage people and roles. */
export const isAdminRole = (role: string) => role === 'owner' || role === 'admin'

/** Permission switches for a role: built-in defaults overridden by the organization's saved settings. */
export async function permissionsFor(organizationId: string, role: string) {
  const base = { ...(DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.member) }
  if (role === 'owner' || role === 'guard') return base
  const rows = await db.select({ permission: rolePermissions.permission, allowed: rolePermissions.allowed }).from(rolePermissions)
    .where(and(eq(rolePermissions.organizationId, organizationId), eq(rolePermissions.role, role)))
  for (const row of rows) if (row.permission in base) base[row.permission as PermissionKey] = row.allowed
  return base
}
export async function can(current: Actor, permission: PermissionKey) { return (await permissionsFor(current.organizationId, current.role))[permission] }

/** Approving payroll and other sensitive actions follow the "runPayroll" switch. */
export async function isModerator(current: Actor) { return can(current, 'runPayroll') }

const zone = 'Africa/Lagos'
/** Date (YYYY-MM-DD) and hour in Lagos time. */
export function lagosParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), month: `${parts.year}-${parts.month}` }
}

export { patrolSlots, DEFAULT_SHIFT, normalizeShift, slotForHour } from '@/lib/server-rules'

export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (value: number) => (value * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
