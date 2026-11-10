'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/brand'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode, databaseConfigured, signUpAllowed = true }: { mode: 'sign-in' | 'sign-up'; databaseConfigured: boolean; signUpAllowed?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!databaseConfigured) {
      setError('Backend setup is incomplete. Add your Neon DATABASE_URL to .env.local, run pnpm db:migrate, and restart the app.')
      return
    }
    setPending(true)
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message ?? 'Unable to authenticate with those details. Please try again.')
        return
      }
      if (isSignUp) {
        const baseSlug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bastion'
        const organization = await authClient.organization.create({
          name: `${name.trim()}'s Organization`,
          slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
        })
        if (organization.error || !organization.data) {
          setError(organization.error?.message ?? 'Your account was created, but its organization could not be created. Sign in and contact an administrator.')
          return
        }
        const activeOrganization = await authClient.organization.setActive({ organizationId: organization.data.id })
        if (activeOrganization.error) {
          setError(activeOrganization.error.message ?? 'Your organization was created, but could not be selected. Sign in and select it before continuing.')
          return
        }
      }
      const me = await fetch('/api/me', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null)
      if (me?.role === 'guard') {
        router.push('/guard-app')
      } else {
        router.push('/overview')
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to BastionOS. Check the server and try again.')
    } finally {
      setPending(false)
    }
  }

  const field = 'h-11 w-full rounded-[8px] border border-[#E4E4E7] bg-white px-3 text-[14px] text-[#18181B] outline-none transition-colors placeholder:text-[#9A9AA1] focus:border-[#2A2B2E] focus:ring-2 focus:ring-[#2A2B2E]/10'
  const label = 'flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5D665F]'

  return <main className="flex min-h-screen items-center justify-center bg-[#F5F5F6] px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#18181B]">
    <section className="w-full max-w-[400px] rounded-[14px] border border-[#E4E4E7] bg-white p-6 sm:p-8">
      <div className="mb-7 flex items-center gap-2.5"><Logo size={34} /><span className="text-[17px] font-bold tracking-tight">Bastion<span className="text-[#9A9AA1]">OS</span></span></div>

      <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6B6B72]">{isSignUp ? 'Set up the account your company will use to run operations.' : 'Sign in to your company’s operations workspace.'}</p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        {isSignUp && <label className={label}>Full name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={`${field} mt-1.5 normal-case tracking-normal`} placeholder="Adaeze Okafor" /></label>}
        <label className={label}>Email<input required type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={`${field} mt-1.5 normal-case tracking-normal`} placeholder="you@company.com" /></label>
        <label className={label}>Password
          <span className="relative mt-1.5 block">
            <input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignUp ? 'new-password' : 'current-password'} className={`${field} pr-11 normal-case tracking-normal`} placeholder="At least 8 characters" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-[6px] text-[#6B6B72] hover:bg-[#F5F5F6]">
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        {error && <p role="alert" className="rounded-[8px] border border-[#E9CFC9] bg-[#FDECEA] px-3 py-2.5 text-[12px] leading-relaxed text-[#B42318]">{error}</p>}
        <button disabled={pending} className="mt-1 h-11 w-full rounded-[8px] bg-[#2A2B2E] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#3F4045] disabled:opacity-60">{pending ? (isSignUp ? 'Creating account…' : 'Signing in…') : isSignUp ? 'Create account' : 'Sign in to BastionOS'}</button>
      </form>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-[#6B6B72]">
        {isSignUp ? <>Already have an account? <a className="font-semibold text-[#2A2B2E] underline underline-offset-4" href="/sign-in">Sign in</a></> : signUpAllowed ? <>New to BastionOS? <a className="font-semibold text-[#2A2B2E] underline underline-offset-4" href="/sign-up">Create an account</a></> : <>Accounts are created by your administrator.</>}
      </p>
    </section>
  </main>
}
