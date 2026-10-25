import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { newGuardAppCode, normalizeGuardAppCode } from '@/lib/guard-access'
import { actor, fail, isModerator } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** The shared guard-app code for this organization; created on first view by a moderator. */
export async function GET() {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor()
  if (!current) return fail('Sign in and select an organization.', 401)
  if (!(await isModerator(current))) return fail('Only an owner, administrator or moderator can manage the guard app code.', 403)

  const [organization] = await db.select({ code: organizations.guardAppCode }).from(organizations).where(eq(organizations.id, current.organizationId)).limit(1)
  if (!organization) return fail('Organization not found.', 404)
  if (organization.code) return NextResponse.json({ code: organization.code })

  const [updated] = await db.update(organizations).set({ guardAppCode: newGuardAppCode() })
    .where(eq(organizations.id, current.organizationId)).returning({ code: organizations.guardAppCode })
  return NextResponse.json({ code: updated?.code ?? null })
}

/** Replaces the code, which immediately locks out every phone still using the old one. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor()
  if (!current) return fail('Sign in and select an organization.', 401)
  if (!(await isModerator(current))) return fail('Only an owner, administrator or moderator can manage the guard app code.', 403)

  const body = await request.json().catch(() => ({})) as { code?: unknown }
  const requested = typeof body.code === 'string' ? normalizeGuardAppCode(body.code) : ''
  const code = requested || newGuardAppCode()
  if (!/^GRD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return fail('Use the format GRD-XXXX-XXXX.')

  const [updated] = await db.update(organizations).set({ guardAppCode: code })
    .where(eq(organizations.id, current.organizationId)).returning({ code: organizations.guardAppCode })
  if (!updated) return fail('Organization not found.', 404)
  return NextResponse.json({ code: updated.code })
}
