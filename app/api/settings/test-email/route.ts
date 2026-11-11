import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { sendMail } from '@/lib/email'
import { actor, fail, isModerator } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** Sends a test message to the signed-in administrator so mail setup can be verified. */
export async function POST() {
  const current = await actor()
  if (!current) return fail('Sign in first.', 401)
  if (!(await isModerator(current))) return fail('Only an owner, administrator or moderator can test email delivery.', 403)
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, current.userId)).limit(1)
  if (!user) return fail('Account not found.', 404)
  const result = await sendMail({
    to: user.email,
    subject: 'BastionOS email delivery test',
    text: `Hello ${user.name},\n\nThis is a test from BastionOS. Alert, incident and attendance notifications are configured for this address.\n\nIf you received this, email delivery is working.\n\n— BastionOS`,
  })
  return NextResponse.json({ ...result, ...(result.sent ? {} : { error: result.reason ?? 'Email delivery failed.' }) }, { status: result.sent ? 200 : 503 })
}
