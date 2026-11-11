import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { members, users } from '@/lib/db/schema'
import { sendMail, type Mail } from '@/lib/email'

/** Owners, admins and moderators receive operational notifications. */
export async function notifyOrganization(organizationId: string, build: (email: string) => Mail) {
  const recipients = await db.select({ email: users.email }).from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(and(eq(members.organizationId, organizationId), inArray(members.role, ['owner', 'admin', 'moderator'])))
  await Promise.allSettled(recipients.slice(0, 20).map((recipient) => sendMail(build(recipient.email))))
}
