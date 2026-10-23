import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { rolePermissions } from '@/lib/db/schema'
import { actor, denyGuard, fail, isAdminRole, permissionsFor } from '@/lib/server'
import { EDITABLE_ROLES, PERMISSIONS } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  const denied = denyGuard(current); if (denied) return denied
  const matrix: Record<string, Record<string, boolean>> = {}
  for (const role of ['owner', ...EDITABLE_ROLES, 'guard']) matrix[role] = await permissionsFor(current.organizationId, role)
  return NextResponse.json({ matrix, canEdit: isAdminRole(current.role) })
}

const body = z.object({ role: z.enum(EDITABLE_ROLES), permission: z.enum(PERMISSIONS.map((p) => p.key) as [string, ...string[]]), allowed: z.boolean() })

export async function PATCH(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  if (!isAdminRole(current.role)) return fail('Only the owner or an administrator can change role permissions.', 403)
  const parsed = body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail('Invalid permission change')
  const { role, permission, allowed } = parsed.data
  // An administrator can never lock out the people who manage roles, so finance and payroll stay on for admins.
  if (role === 'admin' && !allowed) return fail('The Administrator role keeps every permission.', 400)
  await db.insert(rolePermissions).values({ organizationId: current.organizationId, role, permission, allowed }).onConflictDoUpdate({ target: [rolePermissions.organizationId, rolePermissions.role, rolePermissions.permission], set: { allowed } })
  return NextResponse.json({ ok: true })
}
