'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bastion'
      const organization = await authClient.organization.create({
        name: name.trim(),
        slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
      })
      if (organization.error || !organization.data) {
        setError(organization.error?.message ?? 'Could not create the organization.')
        return
      }
      const activeOrganization = await authClient.organization.setActive({ organizationId: organization.data.id })
      if (activeOrganization.error) {
        setError(activeOrganization.error.message ?? 'Could not select the organization.')
        return
      }
      router.push('/overview')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete organization setup.')
    } finally {
      setPending(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#F5F5F6] px-5 text-zinc-900">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Set up your organization</h1>
      <p className="mt-2 text-sm text-zinc-600">Choose the company name for your BastionOS workspace.</p>
      <label className="mt-6 block text-sm font-medium">Organization name
        <input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-zinc-300 px-3" />
      </label>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="mt-5 h-11 w-full rounded-lg bg-[#2A2B2E] text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Setting up…' : 'Create organization'}</button>
    </form>
  </main>
}
