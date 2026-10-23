'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Download, RefreshCw, ShieldCheck, UserCog } from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Badge, ErrorBanner, Field, Spinner, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { api, when } from '@/lib/client'

type Workspace = {
  user: { name: string; email: string; role: string }
  organization: { name: string; slug: string }
  members: { id: string; name: string; email: string; role: string; joinedAt: string }[]
}
type Shift = { startHour: number; endHour: number }

const pad = (hour: number) => String(hour).padStart(2, '0')
const hours = Array.from({ length: 25 }, (_, hour) => hour)

export function SettingsPage() {
  const [data, setData] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [nameDraft, setNameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [nameNote, setNameNote] = useState('')

  const [guardCode, setGuardCode] = useState('')
  const [codeNote, setCodeNote] = useState('')
  const [codeError, setCodeError] = useState('')
  const [rotating, setRotating] = useState(false)

  const [shift, setShift] = useState<Shift>({ startHour: 8, endHour: 18 })
  const [shiftNote, setShiftNote] = useState('')
  const [shiftError, setShiftError] = useState('')
  const [savingShift, setSavingShift] = useState(false)

  const load = useCallback(async () => {
    try {
      const workspace = await api<Workspace>('/api/workspace')
      setData(workspace)
      setNameDraft(workspace.organization.name)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load settings.')
    } finally { setLoading(false) }
  }, [])

  const loadAccess = useCallback(async () => {
    try {
      setGuardCode((await api<{ code: string }>('/api/guard/access')).code ?? '')
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : 'Unable to load the guard app code.')
    }
    try {
      setShift(await api<Shift>('/api/shift'))
    } catch (cause) {
      setShiftError(cause instanceof Error ? cause.message : 'Unable to load the patrol shift.')
    }
  }, [])

  useEffect(() => { void load(); void loadAccess() }, [load, loadAccess])

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    setRenaming(true); setNameNote(''); setError('')
    try {
      const organization = await api<{ name: string }>('/api/workspace', { method: 'PATCH', json: { name: nameDraft } })
      setData((current) => current && { ...current, organization: { ...current.organization, name: organization.name } })
      setNameNote('Organization name updated.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to rename the organization.')
    } finally { setRenaming(false) }
  }

  async function rotateCode() {
    if (!window.confirm('Replace the guard app code? Every phone using the old code stops working until you give them the new one.')) return
    setRotating(true); setCodeNote(''); setCodeError('')
    try {
      setGuardCode((await api<{ code: string }>('/api/guard/access', { method: 'POST', json: {} })).code ?? '')
      setCodeNote('New code created. Share it with your supervisors.')
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : 'Unable to replace the code.')
    } finally { setRotating(false) }
  }

  async function saveShift(event: React.FormEvent) {
    event.preventDefault()
    setSavingShift(true); setShiftNote(''); setShiftError('')
    try {
      setShift(await api<Shift>('/api/shift', { method: 'POST', json: shift }))
      setShiftNote('Patrol checkpoints updated. Guards pick this up on their next scan.')
    } catch (cause) {
      setShiftError(cause instanceof Error ? cause.message : 'Unable to save the patrol shift.')
    } finally { setSavingShift(false) }
  }

  const canManage = ['owner', 'admin'].includes(data?.user.role.toLowerCase() ?? '')
  const checkpoints = Math.max(shift.endHour - shift.startHour, 0)

  return <>
    <PageHeader title="Settings" subtitle="How your organization works in BastionOS.">
      <button onClick={() => { void load(); void loadAccess() }} className={btn}><RefreshCw className="size-3.5" />Refresh</button>
    </PageHeader>
    <ErrorBanner message={error} retry={() => void load()} />

    {loading && !data ? <div className="rounded-[18px] border border-zinc-200 bg-white"><Spinner label="Loading settings…" /></div> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Organization</h2>
          <p className="mt-1 text-xs text-zinc-500">The name your team sees everywhere in BastionOS.</p>
          <form onSubmit={rename} className="mt-4 grid gap-3">
            <Field label="Organization name" hint={canManage ? undefined : 'Only an owner or administrator can rename it.'}>
              <input className={inputClass} value={nameDraft} disabled={!canManage} onChange={(event) => setNameDraft(event.target.value)} />
            </Field>
            <Field label="Workspace ID"><input className={`${inputClass} bg-zinc-50 font-mono text-xs`} value={data?.organization.slug ?? ''} disabled /></Field>
            <div className="flex items-center gap-3">
              <button className={btnPrimary} disabled={!canManage || renaming || nameDraft.trim().length < 2}>{renaming ? 'Saving…' : 'Save name'}</button>
              {nameNote && <span role="status" className="text-xs text-emerald-700">{nameNote}</span>}
            </div>
          </form>
        </section>

        <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Your account</h2>
          <p className="mt-1 text-xs text-zinc-500">Signed in as {data?.user.email}.</p>
          <dl className="mt-4 grid gap-3 text-xs">
            <div className="flex items-center justify-between"><dt className="text-zinc-500">Name</dt><dd className="font-semibold">{data?.user.name}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-zinc-500">Role</dt><dd><Badge value={data?.user.role} /></dd></div>
          </dl>
          <Link href="/profile" className={`${btn} mt-4`}><UserCog className="size-3.5" />Change my photo or name</Link>
        </section>

        <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Guard app access</h2>
          <p className="mt-1 text-xs text-zinc-500">Guard phones enter this code once at <span className="font-mono">/guard-app</span>. No manager login is needed on the phone, and every phone shares the same code.</p>
          <ErrorBanner message={codeError} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm font-semibold tracking-wider">{guardCode || '—'}</code>
            <button onClick={() => guardCode && void navigator.clipboard.writeText(guardCode)} disabled={!guardCode} className={btn}><Copy className="size-3.5" />Copy</button>
            <button onClick={() => void rotateCode()} disabled={rotating} className={btnPrimary}>{rotating ? 'Replacing…' : 'Replace code'}</button>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Replace the code if a phone is lost or a guard leaves — every phone must then enter the new code.</p>
          {codeNote && <p role="status" className="mt-2 text-xs text-emerald-700">{codeNote}</p>}
        </section>

        <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Patrol shift</h2>
          <p className="mt-1 text-xs text-zinc-500">Guards sign one checkpoint every hour inside this window, in Lagos time. Right now that is <b>{checkpoints} checkpoint{checkpoints === 1 ? '' : 's'}</b> per day, {pad(shift.startHour)}:00–{pad(Math.max(shift.endHour - 1, 0))}:59.</p>
          <ErrorBanner message={shiftError} />
          <form onSubmit={saveShift} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Starts"><select value={shift.startHour} onChange={(event) => setShift({ ...shift, startHour: Number(event.target.value) })} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs">{hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{pad(hour)}:00</option>)}</select></Field>
            <Field label="Ends"><select value={shift.endHour} onChange={(event) => setShift({ ...shift, endHour: Number(event.target.value) })} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs">{hours.slice(1).map((hour) => <option key={hour} value={hour}>{pad(hour)}:00</option>)}</select></Field>
            <button className={btnPrimary} disabled={savingShift || shift.endHour <= shift.startHour}>{savingShift ? 'Saving…' : 'Save shift'}</button>
          </form>
          {shift.endHour <= shift.startHour && <p className="mt-2 text-xs text-red-700">The shift must end after it starts.</p>}
          {shiftNote && <p role="status" className="mt-2 text-xs text-emerald-700">{shiftNote}</p>}
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Team</h2><p className="mt-1 text-xs text-zinc-500">Everyone who can sign in to this workspace. Roles decide what people may change.</p></header>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['NAME', 'EMAIL', 'ROLE', 'JOINED'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead>
          <tbody>{(data?.members ?? []).map((member) => <tr key={member.id} className="border-t border-zinc-100"><td className="px-4 py-3 font-semibold">{member.name}</td><td className="px-4 py-3">{member.email}</td><td className="px-4 py-3"><Badge value={member.role} /></td><td className="px-4 py-3">{new Date(member.joinedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        <div className="border-t border-zinc-100 p-4">
          <p className="text-[11px] text-zinc-600"><b>Owner / Administrator</b> — everything, including payroll and deleting records. <b>Moderator</b> — day-to-day operations, payroll marking, deleting records. <b>Member</b> — can view and use the workspace.</p>
          <p className="mt-2 text-[11px] text-zinc-500">Inviting staff by email needs an email provider configured on the server; until then, create accounts from the sign-up page and set their role in the members table.</p>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Data</h2><p className="mt-1 text-xs text-zinc-500">Download a copy of everything your workspace holds.</p></header>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {['guards', 'sites', 'attendance', 'patrols', 'incidents', 'clients', 'finances', 'payroll'].map((section) => <a key={section} href={`/api/export?section=${section}`} className={btn}><Download className="size-3.5" /><span className="capitalize">{section}</span></a>)}
        </div>
        <p className="flex items-center gap-2 border-t border-zinc-100 p-4 text-[11px] text-zinc-500"><ShieldCheck className="size-3.5" />Every record is scoped to this organization only. Generated {data ? when(new Date().toISOString()) : ''}.</p>
      </section>
    </>}
  </>
}
