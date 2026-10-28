'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, Circle, KeyRound, LogOut, MapPin, ShieldAlert, X } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/brand'
import { Avatar } from '@/components/ui-bits'

interface NfcReader extends EventTarget {
  onreading: ((event: { message: { records: Array<{ recordType?: string; data?: DataView | string }> } }) => void) | null
  onreadingerror: (() => void) | null
  scan(options?: { signal?: AbortSignal }): Promise<void>
}
declare global { interface Window { NDEFReader?: new () => NfcReader } }

type Action = 'attendance' | 'patrol' | 'sos'
type Today = { today: string; hour: number; shift: { startHour: number; endHour: number }; slots: string[]; checkedInAt: string | null; checkedOutAt: string | null; insideGeofence: boolean | null; signed: Record<string, string> }
type Identity = { name: string; site: string | null; photoUrl: string | null }
type Me = { linked: boolean; role: string; guard?: Identity & { id: string } } & Partial<Today>

const CODE_KEY = 'bastion.guardCode'
/** The tag code this phone last scanned, so SOS can identify the guard without a fresh scan. */
const TAG_KEY = 'bastion.guardTag'
const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : ''
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

function position(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }) })
}

/** Guard app. A guard signs in with their own login, or a phone is set up once with the company guard app code. */
export function GuardMobilePage() {
  const [me, setMe] = useState<Me | null>(null); const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [code, setCode] = useState(''); const [codeDraft, setCodeDraft] = useState(''); const [company, setCompany] = useState(''); const [codeError, setCodeError] = useState(''); const [codeBusy, setCodeBusy] = useState(false)
  const [local, setLocal] = useState<{ who: Identity; today: Today } | null>(null)
  const [nfc, setNfc] = useState(false); const [scanning, setScanning] = useState<Action | null>(null); const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [manual, setManual] = useState(false); const [token, setToken] = useState(''); const [manualAction, setManualAction] = useState<Action>('attendance')
  const [receipt, setReceipt] = useState<{ action: Action; guardName: string; siteName: string | null; withinBounds: boolean | null; checkpoint?: string; at: string } | null>(null)
  const [lastCode, setLastCode] = useState('')
  const controller = useRef<AbortController | null>(null)

  const loadMe = useCallback(() => fetch('/api/guard/me', { cache: 'no-store' }).then(async (r) => { if (!r.ok) { setSignedIn(false); return } setSignedIn(true); setMe(await r.json()) }).catch(() => setSignedIn(false)), [])
  useEffect(() => { void loadMe(); const t = window.setInterval(() => { if (!document.hidden) void loadMe() }, 60000); return () => window.clearInterval(t) }, [loadMe])
  useEffect(() => { setNfc(Boolean(window.NDEFReader && window.isSecureContext)); setCode(window.localStorage.getItem(CODE_KEY) ?? ''); return () => controller.current?.abort() }, [])

  const isGuard = me?.role === 'guard'
  const identity: Identity | null = me?.guard ?? local?.who ?? null
  const today: Today | null = me?.slots ? (me as Today) : local?.today ?? null
  const ready = signedIn === true || Boolean(code)

  async function saveCode(event: FormEvent) {
    event.preventDefault(); setCodeError(''); setCodeBusy(true)
    try {
      const response = await fetch('/api/guard/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codeDraft }) })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error ?? 'That code was not accepted.')
      const clean = codeDraft.trim().toUpperCase(); window.localStorage.setItem(CODE_KEY, clean); setCode(clean); setCompany(body.organizationName ?? ''); setCodeDraft('')
    } catch (e) { setCodeError(e instanceof Error ? e.message : 'That code was not accepted.') } finally { setCodeBusy(false) }
  }
  function forgetCode() { window.localStorage.removeItem(CODE_KEY); setCode(''); setCompany(''); setLocal(null); setMessage('') }

  async function submit(action: Action, tag: string) {
    setBusy(true); setError(''); setMessage(''); setReceipt(null); setLastCode(tag.trim())
    try {
      const where = await position()
      if (!where) throw new Error('Allow location access so your supervisor can confirm you are at your post, then try again.')
      const response = await fetch('/api/guard/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: action, token: tag, ...where, ...(signedIn ? {} : { code }) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not verify this tag.')
      if (tag) window.localStorage.setItem(TAG_KEY, tag.trim())
      setMessage(body.withinBounds === false ? `${body.message} You are outside the site area, so your supervisor has been told.` : body.message)
      setReceipt({ action, guardName: body.guardName ?? 'Unknown guard', siteName: body.siteName ?? null, withinBounds: body.withinBounds ?? null, checkpoint: body.checkpoint, at: clock(new Date().toISOString()) })
      setManual(false); setToken('')
      if (body.status) setLocal({ who: { name: body.guardName, site: body.siteName ?? null, photoUrl: null }, today: body.status })
      if (signedIn) void loadMe()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not verify this tag.') } finally { setBusy(false) }
  }

  async function scan(action: Action) {
    if (action === 'sos') {
      // SOS must work without a tag in hand: reuse the identity this phone already scanned.
      const remembered = window.localStorage.getItem(TAG_KEY) ?? ''
      if (me?.linked || remembered) return void submit('sos', me?.linked ? '' : remembered)
      setError('To send SOS, type your tag code below once so we know who needs help.')
      setManualAction('sos'); setManual(true)
      return
    }
    const Reader = window.NDEFReader
    if (!Reader) { setManualAction(action); return setManual(true) }
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setError(''); setMessage(''); setScanning(action)
    try {
      const reader = new Reader()
      reader.onreading = (event) => {
        const data = event.message.records.find((record) => record.data)?.data
        let text = ''
        if (typeof data === 'string') text = data
        else if (data) { const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); text = new TextDecoder().decode(bytes.subarray(1 + ((bytes[0] ?? 0) & 0x3f))) }
        abort.abort(); setScanning(null); void submit(action, text.trim())
      }
      reader.onreadingerror = () => { setError('That tag could not be read. Try again.'); setScanning(null) }
      await reader.scan({ signal: abort.signal })
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) { setError('NFC could not start. Type the tag code instead.'); setManualAction(action); setManual(true) } setScanning(null) }
  }
  const stop = () => { controller.current?.abort(); setScanning(null) }
  const big = 'flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold disabled:opacity-60'

  const slots = today?.slots ?? []; const signed = today?.signed ?? {}; const signedCount = slots.filter((slot) => signed[slot]).length
  const checkedIn = Boolean(today?.checkedInAt) && !today?.checkedOutAt; const checkedOut = Boolean(today?.checkedOutAt)
  const patrolDone = slots.length > 0 && signedCount >= slots.length
  const hour = today?.hour ?? 0; const shift = today?.shift
  const windowOpen = shift ? hour >= shift.startHour && hour < shift.endHour : false
  const nextSlot = slots.find((slot) => !signed[slot])
  const currentSlot = shift && windowOpen ? hourLabel(hour) : null
  let next: { action: Action; label: string; help: string; disabled?: boolean } | null = null
  if (!today) next = { action: 'attendance', label: 'Scan your tag', help: 'Tap, then hold your tag to the back of the phone. This checks you in, or out if you are already in.' }
  else if (!checkedIn && !checkedOut) next = { action: 'attendance', label: 'Check in', help: 'You have not checked in yet today. Tap, then hold your tag to the back of the phone.' }
  else if (checkedOut) next = { action: 'attendance', label: 'Check in again', help: `You checked out at ${clock(today.checkedOutAt)}. Tap to start a new check-in.` }
  else if (!patrolDone && windowOpen) next = currentSlot && signed[currentSlot] ? { action: 'patrol', label: `${currentSlot} checkpoint signed`, help: 'Come back at the next hour to sign the next checkpoint.', disabled: true } : { action: 'patrol', label: `Sign checkpoint ${currentSlot ?? nextSlot ?? ''}`.trim(), help: 'Walk to the checkpoint, tap, then hold your tag to the back of the phone.' }
  else if (!patrolDone) next = { action: 'patrol', label: 'Patrol window closed', help: shift && hour < shift.startHour ? `Patrol checkpoints open at ${hourLabel(shift.startHour)}.` : `The patrol shift ended at ${hourLabel(shift?.endHour ?? 0)}.`, disabled: true }
  const step = (done: boolean, title: string, detail: string) => <li className="flex items-start gap-3"><span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${done ? 'bg-[#16794A] text-white' : 'border border-zinc-300 text-zinc-400'}`}>{done ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}</span><span><b className="block text-sm font-semibold">{title}</b><span className="text-xs text-zinc-500">{detail}</span></span></li>

  return (
    <main className="min-h-screen bg-[#F5F5F6] pb-10 text-[#18181B]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 bg-[#2A2B2E] px-4 text-white">
        {isGuard || (!signedIn && signedIn !== null) ? <span className="size-2" /> : <Link href="/overview" aria-label="Back to dashboard" className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10"><ChevronLeft className="size-5" /></Link>}
        <Logo size={32} /><div className="flex-1"><p className="text-sm font-semibold leading-none">BastionOS Guard</p></div>
        {isGuard && <button onClick={() => void authClient.signOut().then(() => { window.location.href = '/sign-in' })} className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs hover:bg-white/10"><LogOut className="size-4" />Sign out</button>}
      </header>
      <div className="mx-auto max-w-[480px] px-4 pt-5">
        {signedIn === null ? <p className="py-10 text-center text-xs text-zinc-500">Loading…</p> : !ready ? (
          <form onSubmit={saveCode} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
            <h1 className="text-lg font-semibold">Set up this phone</h1>
            <p className="text-xs leading-5 text-zinc-600">Enter the company guard app code your supervisor gave you. You only do this once. Or <Link href="/sign-in" className="font-semibold underline">sign in</Link> with your own login.</p>
            <input required value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase())} placeholder="GRD-XXXX-XXXX" autoCapitalize="characters" className="h-12 rounded-xl border border-zinc-300 px-3 font-mono text-base" />
            {codeError && <p role="alert" className="text-xs text-red-700">{codeError}</p>}
            <button disabled={codeBusy} className={`${big} bg-[#2A2B2E] text-white`}>{codeBusy ? 'Checking…' : 'Use this code'}</button>
          </form>
        ) : <>
          {!signedIn && code && <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-600"><span>Company code <b className="font-mono text-zinc-900">{code}</b>{company ? ` · ${company}` : ''}</span><button onClick={forgetCode} className="font-semibold underline">Change</button></div>}
          {identity ? <section className="mb-4 flex items-center gap-3"><Avatar name={identity.name} src={identity.photoUrl} size={56} /><div><p className="text-xs text-zinc-500">Good day,</p><p className="text-xl font-medium leading-tight">{identity.name}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="size-3" />{identity.site ?? 'No site assigned yet'}</p></div></section>
            : signedIn && me ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{isGuard ? 'Your login is not linked to a guard record yet. Ask your supervisor to link it in Settings. You can still scan your own tag.' : 'You are viewing the guard app as staff. Guards see their own name and progress here.'}</p>
            : <p className="mb-4 text-xs text-zinc-500">Scan your tag to begin. Your name and site appear after the first scan.</p>}

          <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="text-xs font-semibold tracking-wide text-zinc-500">TODAY</h2>
            <ol className="mt-3 grid gap-4">
              {step(checkedIn, checkedIn ? `Checked in at ${clock(today?.checkedInAt)}` : checkedOut ? `Checked out at ${clock(today?.checkedOutAt)}` : 'Check in', checkedIn ? (today?.insideGeofence === false ? 'You were outside the site area. Your supervisor has been told.' : 'You are marked present for today.') : checkedOut ? 'Your shift is marked complete.' : 'Scan your tag when you arrive at your post.')}
              {step(patrolDone, `Patrol checkpoints ${signedCount} of ${slots.length || '–'}`, shift ? `Sign one checkpoint every hour from ${hourLabel(shift.startHour)} to ${hourLabel(shift.endHour)}.` : 'Your shift hours appear after your first scan.')}
            </ol>
            {slots.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{slots.map((slot) => <span key={slot} className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg border text-xs ${signed[slot] ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-zinc-200 text-zinc-500'}`}><b className="font-mono">{slot}</b><span className="text-[10px]">{signed[slot] ? clock(signed[slot]) : 'Open'}</span></span>)}</div>}
          </section>

          {next && <section className="mt-4"><button className={`${big} bg-[#2A2B2E] text-white`} disabled={busy || scanning !== null || next.disabled} onClick={() => void scan(next!.action)}>{scanning ? 'Hold your tag to the phone…' : next.label}</button><p className="mt-2 text-center text-xs text-zinc-500">{next.help}</p></section>}
          {!next && <p className="mt-4 rounded-2xl border border-[#16794A]/30 bg-[#E3F4EA] p-4 text-center text-sm font-semibold text-[#16794A]">All checkpoints signed. Well done.</p>}
          {checkedIn && <button className={`${big} mt-3 border border-zinc-300 bg-white`} disabled={busy || scanning !== null} onClick={() => void scan('attendance')}>Check out</button>}

          {scanning && <button onClick={stop} className={`${big} mt-3 border border-zinc-300 bg-white`}><X className="size-4" />Cancel</button>}
          {busy && <p className="mt-3 text-center text-xs text-zinc-500">Checking…</p>}
          {message && !busy && <p role="status" className="mt-3 rounded-xl border border-[#16794A]/30 bg-[#E3F4EA] p-3 text-sm text-[#16794A]">{message}</p>}
          {receipt && !busy && <div role="status" className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{receipt.action === 'attendance' ? 'Attendance recorded' : receipt.action === 'patrol' ? 'Patrol checkpoint recorded' : 'SOS sent'}</p>
            <dl className="mt-1.5 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1">
              <dt className="text-zinc-500">Guard</dt><dd className="font-semibold">{receipt.guardName}</dd>
              <dt className="text-zinc-500">Site</dt><dd>{receipt.siteName ?? 'No site assigned'}</dd>
              <dt className="text-zinc-500">Time</dt><dd className="font-mono">{receipt.at}</dd>
              {receipt.checkpoint && <><dt className="text-zinc-500">Checkpoint</dt><dd className="font-mono">{receipt.checkpoint}</dd></>}
              <dt className="text-zinc-500">Location</dt><dd className={receipt.withinBounds === false ? 'font-semibold text-[#B42318]' : 'text-[#16794A]'}>{receipt.withinBounds === false ? 'Outside the geofence — supervisor alerted' : 'Inside the site geofence'}</dd>
            </dl>
          </div>}
          {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {lastCode && <p className="mt-1.5 border-t border-red-200 pt-1.5 font-mono text-[10px] text-red-800/80">Tag read: {lastCode}</p>}
          </div>}

          <button onClick={() => setManual((m) => !m)} className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 text-xs font-semibold text-zinc-600"><KeyRound className="size-4" />{nfc ? 'Tag not reading? Type the tag code' : 'No NFC on this phone? Type the tag code'}</button>
          {manual && <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) void submit(manualAction, token.trim()) }} className="mt-2 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4"><label className="text-xs font-semibold">What is the code for?<select value={manualAction} onChange={(e) => setManualAction(e.target.value as Action)} className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"><option value="attendance">Check in or out</option><option value="patrol">Patrol checkpoint</option><option value="sos">Emergency SOS</option></select></label><label className="text-xs font-semibold">Tag code<input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. 9f2b7c41-3a5e-4d18-9c6b-2f7e8a1d4b90" className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 font-mono text-sm" /></label><button disabled={busy || !token.trim()} className={`${big} min-h-[48px] bg-[#2A2B2E] text-white`}>Send</button></form>}

          <div className="mt-8 border-t border-zinc-200 pt-5"><button onClick={() => { if (window.confirm('Send an emergency SOS to your supervisors now?')) void scan('sos') }} disabled={busy || scanning !== null} className={`${big} bg-[#B42318] text-white`}><ShieldAlert className="size-5" />Emergency SOS</button>
            <p className="mt-2 text-center text-[11px] text-zinc-500">Only press this if you are in danger or need urgent help. Supervisors are alerted straight away with your location.{!me?.linked && !identity ? ' The first time, you will be asked for your tag code so we know who needs help.' : ''}</p></div>
        </>}
      </div>
    </main>
  )
}
