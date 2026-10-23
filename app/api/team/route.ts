import { and, eq, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { accounts, authSessions, guards, members, users } from '@/lib/db/schema'
import { actor, denyGuard, fail, isAdminRole } from '@/lib/server'
import { ASSIGNABLE_ROLES } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  const denied = denyGuard(current); if (denied) return denied
  const rows = await db.select({
    id: members.id, userId: members.userId, role: members.role, createdAt: members.createdAt,
    name: users.name, email: users.email, image: users.image,
    guardId: guards.id, guardName: guards.name,
  }).from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(guards, and(eq(guards.loginUserId, users.id), eq(guards.organizationId, members.organizationId)))
    .where(eq(members.organizationId, current.organizationId))
    .orderBy(members.createdAt)
  const active = await db.select({ userId: authSessions.userId, lastActive: max(authSessions.updatedAt) }).from(authSessions).groupBy(authSessions.userId)
  const lastActive = new Map(active.map((row) => [row.userId, row.lastActive]))
  return NextResponse.json({ me: current.userId, myRole: current.role, canManage: isAdminRole(current.role), members: rows.map((row) => ({ ...row, lastActive: lastActive.get(row.userId) ?? null })) })
}

const roleSchema = z.enum(ASSIGNABLE_ROLES)
const createSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128).optional(), role: roleSchema, guardId: z.string().uuid().nullish() })
const editSchema = z.object({ memberId: z.string().min(1), role: roleSchema.optional(), name: z.string().trim().min(2).max(120).optional(), email: z.string().trim().toLowerCase().email().optional(), password: z.string().min(8).max(128).optional(), guardId: z.string().uuid().nullish() })

async function target(organizationId: string, memberId: string) {
  const [row] = await db.select({ id: members.id, userId: members.userId, role: members.role }).from(members).where(and(eq(members.id, memberId), eq(members.organizationId, organizationId))).limit(1)
  return row
}
const unlink = (userId: string, organizationId: string) => db.update(guards).set({ loginUserId: null }).where(and(eq(guards.loginUserId, userId), eq(guards.organizationId, organizationId)))
const link = (userId: string, guardId: string, organizationId: string) => db.update(guards).set({ loginUserId: userId }).where(and(eq(guards.id, guardId), eq(guards.organizationId, organizationId)))

/** Owner/admin adds a person: creates the login (or attaches an existing account) with the chosen role. */
export async function POST(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  if (!isAdminRole(current.role)) return fail('Only the owner or an administrator can add users.', 403)
  const parsed = createSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details and try again.')
  const { name, email, password, role, guardId } = parsed.data
  if (role === 'admin' && current.role !== 'owner') return fail('Only the owner can create administrators.', 403)
  let userId: string
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    userId = existing.id
    const [already] = await db.select({ id: members.id }).from(members).where(and(eq(members.organizationId, current.organizationId), eq(members.userId, userId))).limit(1)
    if (already) return fail('That person is already in your team.', 409)
  } else {
    if (!password) return fail('Set a temporary password of at least 8 characters for the new user.')
    try { const created = await auth.api.signUpEmail({ body: { name, email, password } }); userId = created.user.id } catch (error) { return fail(error instanceof Error ? error.message : 'Unable to create the account.', 400) }
  }
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId: current.organizationId, userId, role })
  if (role === 'guard' && guardId) await link(userId, guardId, current.organizationId)
  return NextResponse.json({ ok: true })
}

/** Owner/admin edits a person's role, name, email or password. Only the owner can touch the owner or other administrators' roles. */
export async function PATCH(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  if (!isAdminRole(current.role)) return fail('Only the owner or an administrator can edit users.', 403)
  const parsed = editSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details and try again.')
  const { memberId, role, name, email, password, guardId } = parsed.data
  const row = await target(current.organizationId, memberId); if (!row) return fail('Person not found.', 404)
  const isSelf = row.userId === current.userId
  if (row.role === 'owner' && current.role !== 'owner') return fail('Only the owner can edit the owner account.', 403)
  if (row.role === 'admin' && current.role !== 'owner' && !isSelf) return fail('Only the owner can edit other administrators.', 403)
  if (role !== undefined && role !== row.role) {
    if (row.role === 'owner') return fail('The owner role cannot be changed here.', 400)
    if (isSelf) return fail('You cannot change your own role.', 400)
    if (role === 'admin' && current.role !== 'owner') return fail('Only the owner can make someone an administrator.', 403)
    await db.update(members).set({ role }).where(eq(members.id, row.id))
    if (role !== 'guard') await unlink(row.userId, current.organizationId)
  }
  if (guardId !== undefined && (role ?? row.role) === 'guard') {
    await unlink(row.userId, current.organizationId)
    if (guardId) await link(row.userId, guardId, current.organizationId)
  }
  if (name !== undefined) await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, row.userId))
  if (email !== undefined) {
    const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (clash && clash.id !== row.userId) return fail('Another account already uses that email.', 409)
    await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, row.userId))
  }
  if (password !== undefined) {
    const context = await auth.$context
    const hash = await context.password.hash(password)
    const done = await db.update(accounts).set({ password: hash, updatedAt: new Date() }).where(and(eq(accounts.userId, row.userId), eq(accounts.providerId, 'credential'))).returning({ id: accounts.id })
    if (!done.length) return fail('That account signs in another way and has no password to reset.', 400)
    await db.delete(authSessions).where(eq(authSessions.userId, row.userId))
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  if (!isAdminRole(current.role)) return fail('Only the owner or an administrator can remove users.', 403)
  const memberId = new URL(request.url).searchParams.get('memberId') ?? ''
  const row = await target(current.organizationId, memberId); if (!row) return fail('Person not found.', 404)
  if (row.role === 'owner') return fail('The owner cannot be removed.', 400)
  if (row.userId === current.userId) return fail('You cannot remove yourself.', 400)
  if (row.role === 'admin' && current.role !== 'owner') return fail('Only the owner can remove administrators.', 403)
  await unlink(row.userId, current.organizationId)
  await db.delete(members).where(eq(members.id, row.id))
  await db.delete(authSessions).where(eq(authSessions.userId, row.userId))
  return NextResponse.json({ ok: true })
}
