import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { orgSettings, organizations } from '@/lib/db/schema'
import { actor, denyGuard, fail, isAdminRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const current = await actor(); if (!current) return fail('Sign in first.', 401); const denied = denyGuard(current); if (denied) return denied
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, current.organizationId)).limit(1)
  return NextResponse.json({ name: org?.name ?? '', settings: await getSettings(current.organizationId), canEdit: isAdminRole(current.role) })
}

const body = z.object({
  name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(30).optional(), address: z.string().trim().max(200).optional(),
  defaultGeofence: z.coerce.number().int().min(10).max(5000).optional(), defaultSalary: z.coerce.number().int().min(0).max(100000000).optional(),
})

export async function PATCH(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  if (!isAdminRole(current.role)) return fail('Only the owner or an administrator can change organisation settings.', 403)
  const parsed = body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the values and try again.')
  const { name, ...rest } = parsed.data
  if (name) await db.update(organizations).set({ name }).where(eq(organizations.id, current.organizationId))
  const merged = { ...(await getSettings(current.organizationId)), ...rest }
  await db.insert(orgSettings).values({ organizationId: current.organizationId, data: merged }).onConflictDoUpdate({ target: orgSettings.organizationId, set: { data: merged } })
  return NextResponse.json({ ok: true })
}
