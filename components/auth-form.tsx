'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/brand'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode, databaseConfigured }: { mode: 'sign-in' | 'sign-up'; databaseConfigured: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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
      router.push('/overview')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to BastionOS. Check the server and try again.')
    } finally {
      setPending(false)
    }
  }

  return <main className="flex min-h-screen bg-[#F5F5F6] text-[#18181B]">
    <section className="hidden flex-1 flex-col justify-between bg-[#2A2B2E] p-12 text-white lg:flex">
      <div>
        <div className="flex items-center gap-3"><Logo size={40} /><span className="text-xl font-bold">Bastion<span className="text-[#B4B4BB]">OS</span></span></div>
        <div className="mt-24 max-w-lg"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4B4BB]">Command intelligence</p><h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-tight">Make every post visible.</h1><p className="mt-6 max-w-md text-base leading-7 text-[#D4D4D8]">A focused operating picture for the people, sites and signals that keep your perimeter secure.</p></div>
      </div>
      <p className="text-xs text-[#B4B4BB]">BastionOS · Security operations</p>
    </section>
    <section className="flex w-full items-center justify-center p-6 lg:w-[480px] lg:bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-10 lg:hidden"><div className="flex items-center gap-3"><Logo size={40} /><span className="text-xl font-bold">Bastion<span className="text-[#B4B4BB]">OS</span></span></div></div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#71717A]">Sign in</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{isSignUp ? 'Create your command account' : 'Welcome back'}</h2>
        <p className="mt-2 text-sm text-[#71717A]">Operations records are shared with members of your organization.</p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {isSignUp && <label className="flex flex-col gap-2 text-sm font-medium">Full name<input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-3 outline-none focus:border-[#2A2B2E]" placeholder="Adaeze Okafor" /></label>}
          <label className="flex flex-col gap-2 text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-3 outline-none focus:border-[#2A2B2E]" placeholder="you@company.com" /></label>
          <label className="flex flex-col gap-2 text-sm font-medium">Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-3 outline-none focus:border-[#2A2B2E]" placeholder="At least 8 characters" /></label>
          {error && <p role="alert" className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#B42318]">{error}</p>}
          <button disabled={pending} className="mt-2 rounded-lg bg-[#2A2B2E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Verifying…' : isSignUp ? 'Create account' : 'Sign in to BastionOS'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[#71717A]">{isSignUp ? 'Already have an account?' : 'New to BastionOS?'} <a className="font-semibold text-[#2A2B2E] underline underline-offset-4" href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Create an account'}</a></p>
      </div>
    </section>
  </main>
}
