import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { actor, fail, isModerator, normalizeShift } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** Patrol shift: one checkpoint per hour from start until end. */
export async function GET() {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor()
  if (!current) return fail('Sign in and select an organization.', 401)
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, current.organizationId)).limit(1)
  if (!organization) return fail('Organization not found.', 404)
  return NextResponse.json(normalizeShift(organization.startHour, organization.endHour))
}

const shiftSchema = z.object({
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
})

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor()
  if (!current) return fail('Sign in and select an organization.', 401)
  if (!(await isModerator(current))) return fail('Only an owner, administrator or moderator can change the patrol shift.', 403)

  const parsed = shiftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('Pick a start hour between 0 and 23 and an end hour between 1 and 24.')
  if (parsed.data.endHour <= parsed.data.startHour) return fail('The shift must end after it starts.')

  const [updated] = await db.update(organizations).set({ patrolStartHour: parsed.data.startHour, patrolEndHour: parsed.data.endHour })
    .where(eq(organizations.id, current.organizationId))
    .returning({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
  if (!updated) return fail('Organization not found.', 404)
  return NextResponse.json(updated)
}
