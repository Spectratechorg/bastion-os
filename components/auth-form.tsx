'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/brand'
import { ErrorBanner, Field, btnPrimary, inputClass } from '@/components/ui-bits'

type Mode = 'sign-in' | 'sign-up' | 'onboarding'

function Frame({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[#F5F5F6] text-[#18181B]">
      <section className="hidden flex-1 flex-col justify-between bg-[#2A2B2E] p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><Logo size={40} /><span className="text-xl font-semibold">Bastion<span className="ml-0.5 text-xs opacity-60">OS</span></span></div>
        <div className="max-w-md"><h2 className="text-4xl font-normal leading-tight tracking-tight">Know where every guard is, and what they signed.</h2><p className="mt-4 text-sm text-zinc-400">Attendance, patrols, incidents and payroll for your guard company in one place.</p></div>
        <p className="text-xs text-zinc-500">Spectra Technology and Development Ltd.</p>
      </section>
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo size={36} /><span className="text-lg font-semibold">BastionOS</span></div>
          <h1 className="text-2xl font-normal tracking-tight">{title}</h1><p className="mb-6 mt-1 text-sm text-zinc-500">{text}</p>{children}
        </div>
      </section>
    </main>
  )
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const [name, setName] = useState(''); const [company, setCompany] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [error, setError] = useState(''); const [pending, setPending] = useState(false)

  async function createOrg(companyName: string) {
    const response = await fetch('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: companyName }) })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Could not set up your company.')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setPending(true)
    try {
      if (mode === 'onboarding') await createOrg(company)
      else {
        const result = mode === 'sign-up' ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password })
        if (result.error) throw new Error(result.error.message ?? 'Unable to authenticate with those details.')
        if (mode === 'sign-up') await createOrg(company)
        else { const ok = await createOrg('').then(() => true).catch(() => false); if (!ok) { router.push('/onboarding'); return } }
      }
      router.push('/overview'); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') } finally { setPending(false) }
  }

  const titles = { 'sign-in': ['Sign in', 'Welcome back to BastionOS.'], 'sign-up': ['Create your account', 'Set up BastionOS for your guard company.'], onboarding: ['Name your company', 'This is the organization your guards, sites and payroll belong to.'] } as const
  return (
    <Frame title={titles[mode][0]} text={titles[mode][1]}>
      <form onSubmit={submit} className="grid gap-4">
        <ErrorBanner message={error} />
        {mode === 'sign-up' && <Field label="Your name"><input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        {mode !== 'sign-in' && <Field label="Company name"><input required minLength={2} className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Bastion Guards Ltd." /></Field>}
        {mode !== 'onboarding' && <>
          <Field label="Email"><input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Field label="Password"><input required type="password" minLength={8} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} /></Field>
        </>}
        <button className={`${btnPrimary} h-11 w-full`} disabled={pending}>{pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Continue'}</button>
      </form>
      {mode === 'sign-in' && <p className="mt-6 text-center text-sm text-zinc-500">New here? <Link href="/sign-up" className="font-semibold text-[#18181B] underline">Create an account</Link></p>}
      {mode === 'sign-up' && <p className="mt-6 text-center text-sm text-zinc-500">Already have an account? <Link href="/sign-in" className="font-semibold text-[#18181B] underline">Sign in</Link></p>}
    </Frame>
  )
}
