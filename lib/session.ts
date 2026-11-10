import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { cached } from '@/lib/cache'

/**
 * Server-side guard for workspace pages: signed-out visitors go to the login page,
 * and members who have not picked a company yet go to onboarding.
 *
 * The session lookup is cached per cookie for a short window: every tab switch renders a server
 * page, and without this each switch paid a Supabase round-trip before the page could even start.
 */
export async function requireWorkspace() {
  const requestHeaders = await headers()
  const cookie = requestHeaders.get('cookie') ?? ''
  const key = cookie ? `workspace-session:${createHash('sha256').update(cookie).digest('base64url').slice(0, 32)}` : ''
  const session = key
    ? await cached(key, 30_000, () => auth.api.getSession({ headers: requestHeaders }))
    : await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) redirect('/sign-in')
  if (!session.session.activeOrganizationId) redirect('/onboarding')
  return session
}
