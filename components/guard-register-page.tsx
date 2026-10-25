'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Camera, Check, ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Avatar, ErrorBanner, Field, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { api, photoToDataUrl } from '@/lib/client'
import { WriteTagButton } from '@/components/write-tag-button'

type Site = { id: string; name: string; status: string }
type Created = { id: string; name: string; nfcToken: string }

export function GuardRegisterPage() {
  const [sites, setSites] = useState<Site[]>([]); const [photo, setPhoto] = useState<string | null>(null)
  const [v, setV] = useState({ name: '', nin: '', phone: '', site: '', monthlySalary: '150000' })
  const [error, setError] = useState(''); const [sitesError, setSitesError] = useState(''); const [saving, setSaving] = useState(false); const [created, setCreated] = useState<Created | null>(null)
  const file = useRef<HTMLInputElement>(null)
  async function loadSites() {
    try {
      setSites(await api<Site[]>('/api/operations?section=sites'))
      setSitesError('')
    } catch (cause) {
      setSitesError(cause instanceof Error ? cause.message : 'Unable to load sites.')
    }
  }
  useEffect(() => { void loadSites() }, [])

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0]; if (!f) return
    try { setPhoto(await photoToDataUrl(f)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that photo.') }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!/^\d{11}$/.test(v.nin)) return setError('NIN must be exactly 11 digits.')
    setSaving(true)
    try { setCreated(await api<Created>('/api/operations', { method: 'POST', json: { section: 'guards', ...v, site: v.site || null, photoUrl: photo } })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to register the guard.') } finally { setSaving(false) }
  }

  if (created) return <>
    <PageHeader title="Guard registered" subtitle={`${created.name} is on the roster and ready to scan.`} />
    <section className="max-w-xl rounded-[18px] border border-zinc-200 bg-white p-6">
      <div className="flex items-center gap-4"><Avatar name={created.name} src={photo} size={64} /><div><p className="text-lg font-medium">{created.name}</p><p className="text-xs text-zinc-500">NFC tag to write onto the guard’s card</p></div></div>
      <p className="mt-5 break-all rounded-lg bg-zinc-50 p-4 text-center font-mono text-sm tracking-wide">{created.nfcToken}</p>
      <p className="mt-2 text-xs text-zinc-500">Write this code onto the guard’s NFC tag now, or copy it for a tag-writer app. Scans match it to this guard.</p>
      <WriteTagButton token={created.nfcToken} owner={created.name} />
      <div className="mt-6 flex flex-wrap gap-2"><Link href="/guards" className={btnPrimary}><Check className="size-4" />Go to guards</Link><button className={btn} onClick={() => { setCreated(null); setPhoto(null); setV({ name: '', nin: '', phone: '', site: '', monthlySalary: '150000' }) }}>Register another</button></div>
    </section>
  </>

  return <>
    <PageHeader title="Register guard" subtitle="Add the guard’s details, photo and site. An NFC tag is issued automatically."><Link href="/guards" className={btn}><ChevronLeft className="size-4" />Back</Link></PageHeader>
    <form onSubmit={submit} className="grid max-w-3xl gap-5 rounded-[18px] border border-zinc-200 bg-white p-5 sm:p-6">
      <ErrorBanner message={error} />
      <ErrorBanner message={sitesError} retry={() => void loadSites()} />
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} aria-label="Add guard photo" className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 hover:border-zinc-500">
          {photo ? <Avatar name={v.name || 'Guard'} src={photo} size={96} /> : <Camera className="size-6" />}
        </button>
        <div className="text-xs"><b className="block text-sm font-semibold">Guard photo (optional)</b><span className="text-zinc-500">Take a clear, front-facing photo or upload one.</span><button type="button" onClick={() => file.current?.click()} className={`${btn} mt-2 block`}>{photo ? 'Retake photo' : 'Take or upload photo'}</button></div>
        <input ref={file} type="file" accept="image/*" capture="user" onChange={pick} className="hidden" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input required minLength={2} className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Musa Adamu" autoComplete="off" /></Field>
        <Field label="Phone number"><input required type="tel" minLength={7} className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="0803 442 1098" /></Field>
        <Field label="NIN" hint="11 digits, stored on the guard record"><input required inputMode="numeric" maxLength={11} className={inputClass} value={v.nin} onChange={(e) => setV({ ...v, nin: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Monthly salary (₦)" hint="Used by payroll"><input required type="number" min={0} className={inputClass} value={v.monthlySalary} onChange={(e) => setV({ ...v, monthlySalary: e.target.value })} /></Field>
        <Field label="Assigned site"><select className={inputClass} value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })}><option value="">Unassigned</option>{sites.filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Link href="/guards" className={btn}>Cancel</Link><button className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Register guard'}</button></div>
    </form>
  </>
}
