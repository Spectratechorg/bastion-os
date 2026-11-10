'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { authClient } from '@/lib/auth-client'
import { Avatar, Spinner, btn, btnPrimary } from '@/components/ui-bits'

/** Personal settings: the signed-in account, profile, password and session. */
export function AccountSettings() {
  const session = authClient.useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (session.isPending) return <section className="ws-card"><Spinner label="Loading your account…" /></section>
  const user = session.data?.user
  if (!user) return <section className="ws-card p-5 text-xs text-[#6B6B72]">You are not signed in.</section>

  async function signOut() {
    setBusy(true)
    try { await authClient.signOut(); router.push('/sign-in') } finally { setBusy(false) }
  }

  return <section className="ws-card">
    <header className="border-b border-[#E4E4E7] px-5 py-4">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Account</h2>
      <p className="mt-0.5 text-xs text-[#6B6B72]">Your personal login. This is separate from the company settings.</p>
    </header>
    <div className="divide-y divide-[#EFEFF1]">
      <div className="flex items-center gap-4 px-5 py-4">
        <Avatar name={user.name} src={user.image} size={44} />
        <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{user.name}</p><p className="truncate text-xs text-[#6B6B72]">{user.email}</p></div>
      </div>
      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-6">
        <p className="text-[12.5px] font-medium">Profile</p>
        <p className="text-xs leading-relaxed text-[#6B6B72]">Change your name or photo from your <Link href="/profile" className="font-medium text-[#18181B] underline underline-offset-4">profile page</Link>.</p>
      </div>
      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-6">
        <p className="text-[12.5px] font-medium">Password</p>
        <div><p className="text-xs leading-relaxed text-[#6B6B72]">Use a password you do not use elsewhere. Changing it signs out other sessions.</p><Link href="/profile#password" className={`${btn} mt-2`}>Change password</Link></div>
      </div>
      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-6">
        <p className="text-[12.5px] font-medium">Session</p>
        <div><p className="text-xs leading-relaxed text-[#6B6B72]">Signing out ends this browser session only.</p><button onClick={() => void signOut()} disabled={busy} className={`${btnPrimary} mt-2`}>{busy ? 'Signing out…' : 'Sign out'}</button></div>
      </div>
    </div>
  </section>
}
