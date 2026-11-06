import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { signUpOpen } from '@/lib/signup'
import { memberRole } from '@/lib/server'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    const orgId = session.session.activeOrganizationId
    if (orgId) {
      const role = await memberRole(orgId, session.user.id)
      if (role === 'guard') redirect('/guard-app')
    }
    redirect('/overview')
  }
  return <AuthForm mode="sign-in" databaseConfigured={Boolean(process.env.DATABASE_URL)} signUpAllowed={await signUpOpen()} />
}
