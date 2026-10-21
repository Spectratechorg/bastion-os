import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { members } from '@/lib/db/schema'

export async function getActiveOrganization() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const organizationId = session.session.activeOrganizationId
  if (!organizationId) return { userId: session.user.id, organizationId: null }

  const [membership] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(and(eq(members.userId, session.user.id), eq(members.organizationId, organizationId)))
    .limit(1)

  return { userId: session.user.id, organizationId: membership?.organizationId ?? null }
}
