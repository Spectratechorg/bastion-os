'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, Clock3, KeyRound, MapPin, Route, ShieldAlert, X } from 'lucide-react'
import { Logo } from '@/components/brand'
import { Avatar } from '@/components/ui-bits'

interface NfcReader extends EventTarget {
  onreading: ((event: { message: { records: Array<{ data?: DataView | string }> } }) => void) | null
  onreadingerror: (() => void) | null
  scan(options?: { signal?: AbortSignal }): Promise<void>
}
declare global { interface Window { NDEFReader?: new () => NfcReader } }

type Action = 'attendance' | 'patrol' | 'sos'
type Result = { message: string; guard?: { name: string; photoUrl: string | null; site: string | null }; slot?: string; signed?: number; total?: number; complete?: boolean }
const SLOTS = ['10:00', '11:00', '12:00']

function position(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => resolve(null), { timeout: 6000, maximumAge: 30000 }) })
}

export function GuardMobilePage() {
  const [nfc, setNfc] = useState(false); const [scanning, setScanning] = useState<Action | null>(null); const [busy, setBusy] = useState(false)
  const [guard, setGuard] = useState<Result['guard'] | null>(null); const [signed, setSigned] = useState<string[]>([]); const [signedCount, setSignedCount] = useState<[number, number] | null>(null)
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [manual, setManual] = useState(false); const [token, setToken] = useState(''); const [manualAction, setManualAction] = useState<Action>('attendance')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { setNfc(Boolean(window.NDEFReader && window.isSecureContext)); return () => controller.current?.abort() }, [])

  async function submit(action: Action, tag: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      const where = await position()
      const response = await fetch('/api/guard/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: action, token: tag, ...where }) })
      const body: Result & { error?: string } = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not verify this tag.')
      setMessage(body.message); if (body.guard) setGuard(body.guard)
      if (action === 'patrol' && body.slot) { setSigned((c) => (c.includes(body.slot!) ? c : [...c, body.slot!])); setSignedCount([body.signed ?? 0, body.total ?? 3]) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not verify this tag.') } finally { setBusy(false) }
  }

  async function scan(action: Action) {
    const Reader = window.NDEFReader
    if (!Reader) return setManual(true)
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setError(''); setMessage('Hold the guard’s NFC tag near the back of the phone.'); setScanning(action)
    try {
      const reader = new Reader()
      reader.onreading = (event) => {
        const data = event.message.records[0]?.data
        const text = typeof data === 'string' ? data : data ? new TextDecoder().decode(data) : ''
        abort.abort(); setScanning(null); void submit(action, text.trim())
      }
      reader.onreadingerror = () => { setError('That tag could not be read. Try again.'); setScanning(null) }
      await reader.scan({ signal: abort.signal })
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) { setError('NFC could not start. Enter the tag code instead.'); setManual(true) } setScanning(null) }
  }
  const stop = () => { controller.current?.abort(); setScanning(null); setMessage('') }
  const big = 'flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60'

  return (
    <main className="min-h-screen bg-[#F5F5F6] pb-10 text-[#18181B]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 bg-[#2A2B2E] px-4 text-white">
        <Link href="/overview" aria-label="Back to dashboard" className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10"><ChevronLeft className="size-5" /></Link>
        <Logo size={32} /><div className="flex-1"><p className="text-sm font-semibold leading-none">BastionOS Guard</p><p className="mt-1 text-[10px] text-zinc-400">Scan to check in and sign patrols</p></div>
      </header>
      <div className="mx-auto max-w-[480px] px-4 pt-5">
        {guard && <section className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4"><Avatar name={guard.name} src={guard.photoUrl} size={56} /><div><p className="text-lg font-medium leading-tight">{guard.name}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="size-3" />{guard.site ?? 'Unassigned'}</p></div></section>}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4" />Attendance</h2><p className="mb-3 mt-1 text-xs text-zinc-500">Scan your tag at the gate to check in. Your location is checked against the site geofence.</p>
          <button className={`${big} bg-[#2A2B2E] text-white`} disabled={busy || scanning !== null} onClick={() => void scan('attendance')}>{scanning === 'attendance' ? 'Waiting for tag…' : 'Scan NFC to check in'}</button></section>

        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Route className="size-4" />Patrol</h2><span className="font-mono text-xs">{signedCount ? `${signedCount[0]} of ${signedCount[1]}` : '0 of 3'}</span></div>
          <p className="mb-3 mt-1 text-xs text-zinc-500">Sign 10:00, 11:00 and 12:00 between 09:00 and 12:59 to complete the patrol.</p>
          <div className="mb-3 grid grid-cols-3 gap-2">{SLOTS.map((slot) => <span key={slot} className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg border text-xs ${signed.includes(slot) ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-zinc-200 text-zinc-500'}`}><b className="font-mono">{slot}</b>{signed.includes(slot) && <Check className="size-3" />}</span>)}</div>
          <button className={`${big} border border-zinc-300 bg-white`} disabled={busy || scanning !== null} onClick={() => void scan('patrol')}>{scanning === 'patrol' ? 'Waiting for tag…' : 'Scan checkpoint tag'}</button></section>

        {scanning && <button onClick={stop} className={`${big} mt-3 border border-zinc-300 bg-white`}><X className="size-4" />Cancel scan</button>}
        {busy && <p className="mt-3 text-center text-xs text-zinc-500">Verifying…</p>}
        {message && !busy && <p role="status" className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm">{message}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button onClick={() => setManual((m) => !m)} className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 text-xs font-semibold text-zinc-600"><KeyRound className="size-4" />{nfc ? 'Tag not reading? Enter tag code' : 'This phone has no NFC. Enter tag code'}</button>
        {manual && <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) void submit(manualAction, token.trim()) }} className="mt-2 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4"><select value={manualAction} onChange={(e) => setManualAction(e.target.value as Action)} className="h-11 rounded-lg border border-zinc-200 px-3 text-sm"><option value="attendance">Check in</option><option value="patrol">Sign patrol checkpoint</option></select><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="BOS-1A2B3C4D" autoCapitalize="characters" className="h-11 rounded-lg border border-zinc-200 px-3 font-mono text-sm outline-none focus:border-zinc-500" /><button className={`${big} bg-[#2A2B2E] text-white`} disabled={busy}>Submit</button></form>}

        <button onClick={() => { if (window.confirm('Send an SOS to your supervisor?')) void scan('sos') }} disabled={busy || scanning !== null} className={`${big} mt-6 bg-[#B42318] text-white`}><ShieldAlert className="size-5" />Emergency SOS</button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">SOS asks you to scan your tag so your supervisor knows who needs help.</p>
      </div>
    </main>
  )
}
