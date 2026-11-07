import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { signUpOpen } from '@/lib/signup'
import { AuthForm } from '@/components/auth-form'
import { AuthUnavailable } from '@/components/auth-unavailable'
import { Logo } from '@/components/brand'

export default async function SignUpPage() {
  let session
  try { session = await auth.api.getSession({ headers: await headers() }) }
  catch { return <AuthUnavailable /> }
  if (session?.user) redirect('/overview')
  const open = await signUpOpen()
  if (!open) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F5F5F6] p-6 text-[#18181B]">
      <section className="w-full max-w-md rounded-[14px] border border-[#E4E4E7] bg-white p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo size={44} /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts are created by your administrator</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#6B6B72]">
          BastionOS is limited to the people your company adds. Ask the owner or an administrator to create your account from
          <b className="font-semibold text-[#18181B]"> Settings → Team</b>, then sign in with the email and temporary password they give you.
        </p>
        <Link href="/sign-in" className="mt-6 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#2A2B2E] px-4 text-[12px] font-semibold text-white hover:bg-[#3F4045]">Go to sign in</Link>
      </section>
    </main>
  }
  return <AuthForm mode="sign-up" databaseConfigured={Boolean(process.env.DATABASE_URL)} signUpAllowed />
}
