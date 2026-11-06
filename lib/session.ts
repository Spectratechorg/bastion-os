import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { memberRole } from '@/lib/server'

/**
 * Server-side guard for workspace pages: signed-out visitors go to the login page,
 * members who have not picked a company yet go to onboarding,
 * and guards are locked exclusively into the guard mobile app.
 */
export async function requireWorkspace() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if (!session.session.activeOrganizationId) redirect('/onboarding')
  const role = await memberRole(session.session.activeOrganizationId, session.user.id)
  if (role === 'guard') redirect('/guard-app')
  return session
}
