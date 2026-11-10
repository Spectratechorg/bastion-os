'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { PageHeader } from '@/components/workspace-shell'
import { Avatar, ErrorBanner, Field, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { photoToDataUrl } from '@/lib/client'

/** Every signed-in user (owner, admin, moderator, staff) can set their own name and photo. */
export function ProfilePage() {
  const session = authClient.useSession()
  const user = session.data?.user
  const file = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('')
  const [pwBusy, setPwBusy] = useState(false); const [pwError, setPwError] = useState(''); const [pwNote, setPwNote] = useState('')

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0]; event.target.value = ''; if (!f) return
    setBusy(true); setError(''); setNote('')
    try {
      const image = await photoToDataUrl(f, 256)
      const result = await authClient.updateUser({ image })
      if (result.error) throw new Error(result.error.message ?? 'Could not save your photo.')
      setNote('Photo updated.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your photo.') } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(''); setNote('')
    const result = await authClient.updateUser({ image: null }); setBusy(false)
    if (result.error) setError(result.error.message ?? 'Could not remove your photo.'); else setNote('Photo removed.')
  }
  async function saveName(event: React.FormEvent) {
    event.preventDefault(); if (!name?.trim()) return
    setBusy(true); setError(''); setNote('')
    const result = await authClient.updateUser({ name: name.trim() }); setBusy(false)
    if (result.error) setError(result.error.message ?? 'Could not save your name.'); else { setNote('Name updated.'); setName(null) }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setPwError(''); setPwNote('')
    if (newPassword.length < 8) return setPwError('Use at least 8 characters for the new password.')
    if (newPassword !== confirmPassword) return setPwError('The new passwords do not match.')
    if (newPassword === currentPassword) return setPwError('Choose a password different from the temporary one.')
    setPwBusy(true)
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (result.error) { setPwError(result.error.message ?? 'Could not change the password.'); return }
      setPwNote('Password changed. Other sessions were signed out.')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (cause) {
      setPwError(cause instanceof Error ? cause.message : 'Could not change the password.')
    } finally { setPwBusy(false) }
  }

  return <>
    <PageHeader title="Profile" subtitle="Your photo and name, shown to your team across BastionOS." />
    <section className="max-w-xl ws-card p-5 sm:p-6">
      <ErrorBanner message={error} />
      {note && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{note}</p>}
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} aria-label="Change photo" className="group relative shrink-0 rounded-full">
          <Avatar name={user?.name ?? 'User'} src={user?.image} size={88} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-5" /></span>
        </button>
        <div className="text-xs"><b className="block text-sm font-semibold">Profile photo</b><span className="text-[#6B6B72]">A clear, front-facing photo works best.</span>
          <span className="mt-2 flex flex-wrap gap-2"><button className={btn} disabled={busy} onClick={() => file.current?.click()}>{user?.image ? 'Change photo' : 'Upload photo'}</button>{user?.image && <button className={btn} disabled={busy} onClick={() => void remove()}>Remove</button>}</span></div>
        <input ref={file} type="file" accept="image/*" capture="user" onChange={pick} className="hidden" />
      </div>
      <form onSubmit={saveName} className="mt-6 grid gap-4 border-t border-[#EBEFE7] pt-5">
        <Field label="Name"><input className={inputClass} value={name ?? user?.name ?? ''} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input className={`${inputClass} bg-[#F5F5F6]`} value={user?.email ?? ''} disabled /></Field>
        <div><button className={btnPrimary} disabled={busy || !name?.trim()}>Save name</button></div>
      </form>
    </section>

    <section id="password" className="mt-4 max-w-xl ws-card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Change password</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#6B6B72]">Use this after signing in with a temporary password from your administrator.</p>
      <ErrorBanner message={pwError} />
      {pwNote && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{pwNote}</p>}
      <form onSubmit={changePassword} className="mt-4 grid gap-4">
        <Field label="Current password"><input required type="password" autoComplete="current-password" className={inputClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters"><input required minLength={8} type="password" autoComplete="new-password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
          <Field label="Confirm new password"><input required minLength={8} type="password" autoComplete="new-password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        </div>
        <div><button className={btnPrimary} disabled={pwBusy}>{pwBusy ? 'Changing…' : 'Change password'}</button></div>
      </form>
    </section>
  </>
}
