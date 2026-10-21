import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if ((session.session as { activeOrganizationId?: string }).activeOrganizationId) redirect('/overview')
  return <AuthForm mode="onboarding" />
}
