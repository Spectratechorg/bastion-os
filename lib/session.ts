import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Server-side guard for workspace pages: signed-out visitors go to the login page,
 * and members who have not picked a company yet go to onboarding.
 */
export async function requireWorkspace() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if (!session.session.activeOrganizationId) redirect('/onboarding')
  return session
}
