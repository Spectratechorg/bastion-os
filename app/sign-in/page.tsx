import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { signUpOpen } from '@/lib/signup'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/overview')
  return <AuthForm mode="sign-in" databaseConfigured={Boolean(process.env.DATABASE_URL)} signUpAllowed={await signUpOpen()} />
}
