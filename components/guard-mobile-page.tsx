'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, ChevronLeft, Clock3, LogIn, LogOut, MapPin, Phone, Route, X } from 'lucide-react'

interface NfcReadingEvent extends Event {
  message: { records: Array<{ recordType: string; data?: DataView | null; encoding?: string; lang?: string }> }
}

interface NfcReader extends EventTarget {
  onreading: ((event: NfcReadingEvent) => void) | null
  onreadingerror: (() => void) | null
  scan(options?: { signal?: AbortSignal }): Promise<void>
}

declare global {
  interface Window { NDEFReader?: new () => NfcReader }
}

type ScanAction = 'attendance' | 'patrol'
type Shift = { startHour: number; endHour: number }

const pad = (hour: number) => String(hour).padStart(2, '0')

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is unavailable in this browser. Allow location access to verify the site boundary.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, () => {
      reject(new Error('Location access is required to check you are at the site. Allow location and try again.'))
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 })
  })
}

export function GuardMobilePage() {
  const [nfcAvailable, setNfcAvailable] = useState<boolean | null>(null)
  const [accessCode, setAccessCode] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codePending, setCodePending] = useState(false)
  const [tagToken, setTagToken] = useState('')
  const [guardName, setGuardName] = useState('')
  const [siteName, setSiteName] = useState('')
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null)
  const [patrolCount, setPatrolCount] = useState<number | null>(null)
  const [shift, setShift] = useState<Shift | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<ScanAction | 'sos' | null>(null)
  const [activeScan, setActiveScan] = useState<ScanAction | null>(null)
  const [sosSent, setSosSent] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    setNfcAvailable(Boolean(window.NDEFReader && window.isSecureContext))
    const storedCode = window.localStorage.getItem('bastion.guardCode') ?? ''
    const storedToken = window.localStorage.getItem('bastion.guardToken') ?? ''
    setAccessCode(storedCode)
    setTagToken(storedToken)
    return () => controller.current?.abort()
  }, [])

  const loadShift = useCallback(async () => {
    try {
      const response = await fetch('/api/shift', { cache: 'no-store' })
      if (response.ok) setShift(await response.json())
    } catch { /* the shift is only used for display */ }
  }, [])

  useEffect(() => { void loadShift() }, [loadShift])

  async function saveCode(event: React.FormEvent) {
    event.preventDefault()
    setCodeError('')
    setCodePending(true)
    try {
      const response = await fetch('/api/guard/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeDraft }),
      })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'That code was not accepted.')
      const code = codeDraft.trim().toUpperCase()
      window.localStorage.setItem('bastion.guardCode', code)
      setAccessCode(code)
      setOrganizationName(payload.organizationName ?? '')
      setCodeDraft('')
      setMessage(`This phone is set up for ${payload.organizationName ?? 'your company'}. Scan a guard card to start.`)
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : 'That code was not accepted.')
    } finally {
      setCodePending(false)
    }
  }

  function resetPhone() {
    window.localStorage.removeItem('bastion.guardCode')
    window.localStorage.removeItem('bastion.guardToken')
    setAccessCode('')
    setTagToken('')
    setGuardName('')
    setSiteName('')
    setCheckedIn(null)
    setPatrolCount(null)
    setMessage('This phone has been reset. Enter the company code again to use it.')
  }

  async function submitScan(action: ScanAction, rawToken: string) {
    const token = rawToken.trim()
    if (!token) {
      setError('Scan a guard card or type the tag code from the roster.')
      return
    }
    setError('')
    setBusy(action)
    setMessage(action === 'attendance' ? 'Checking your card and location…' : 'Recording the patrol checkpoint…')
    try {
      const position = await currentPosition()
      const response = await fetch('/api/guard/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: action,
          token,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(accessCode ? { code: accessCode } : {}),
        }),
      })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Unable to verify the guard card.')

      window.localStorage.setItem('bastion.guardToken', token)
      setTagToken(token)
      setGuardName(payload.guardName ?? '')
      setSiteName(payload.siteName ?? '')
      if (action === 'attendance') {
        setCheckedIn(Boolean(payload.checkedIn))
        setMessage(`${payload.checkedIn ? 'Clocked in' : 'Clocked out'} at ${wallClock()}.`)
      } else {
        setPatrolCount(Number(payload.patrolCount ?? 0))
        setMessage(`Patrol checkpoint ${payload.checkpoint ?? ''} saved. ${payload.patrolCount ?? 0} so far today.`)
        void loadShift()
      }
      if (!payload.withinBounds) {
        setError('Saved, but your phone was outside the site boundary. Your supervisor will see this as a geofence breach.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify the guard card.')
      setMessage('')
    } finally {
      setBusy(null)
    }
  }

  function stopScan() {
    controller.current?.abort()
    controller.current = null
    setActiveScan(null)
  }

  /** Reads the NDEF text record from an NFC card, then runs the same verification as typing the code. */
  async function scanNfc(action: ScanAction) {
    const Reader = window.NDEFReader
    if (!Reader) {
      setError('This phone cannot read NFC in the browser. Type the tag code printed on the guard card instead.')
      return
    }
    if (!window.isSecureContext) {
      setError('NFC needs a secure HTTPS address. Open this page on the HTTPS link, or type the tag code instead.')
      return
    }
    stopScan()
    setError('')
    setMessage('Hold the guard card against the back of your phone…')
    setActiveScan(action)
    const abort = new AbortController()
    controller.current = abort
    const reader = new Reader()

    reader.onreading = async (event) => {
      const record = event.message.records.find((candidate) => candidate.recordType === 'text' && candidate.data)
      abort.abort()
      controller.current = null
      setActiveScan(null)
      if (!record?.data) {
        setError('That card has no text record. Ask your supervisor to write the guard tag code onto it as plain text.')
        return
      }
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)
      const languageLength = (bytes[0] ?? 0) & 0x3f
      const token = new TextDecoder(record.encoding || 'utf-8').decode(bytes.subarray(1 + languageLength)).trim()
      if (!token) {
        setError('That card is empty. Ask your supervisor to write the guard tag code onto it.')
        return
      }
      await submitScan(action, token)
    }

    reader.onreadingerror = () => {
      abort.abort()
      controller.current = null
      setActiveScan(null)
      setError('The card could not be read. Hold it flat against the back of the phone and try again.')
    }

    try {
      await reader.scan({ signal: abort.signal })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Unable to start NFC scanning.')
      setActiveScan(null)
      controller.current = null
    }
  }

  async function sendSos() {
    if (!tagToken) {
      setError('Scan your guard card first, then press SOS.')
      return
    }
    if (!window.confirm('Send an emergency alert to your supervisors?')) return
    setError('')
    setBusy('sos')
    try {
      const position = await currentPosition().catch(() => null)
      const response = await fetch('/api/guard/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tagToken,
          ...(accessCode ? { code: accessCode } : {}),
          ...(position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : {}),
        }),
      })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Unable to send the SOS.')
      setSosSent(true)
      setMessage(payload.duplicate ? 'An SOS was already sent in the last 5 minutes.' : 'SOS sent. Your supervisors have been alerted.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send the SOS.')
    } finally {
      setBusy(null)
    }
  }

  const shiftLabel = shift ? `${pad(shift.startHour)}:00–${pad(shift.endHour - 1)}:59` : 'your shift'
  const statusLabel = checkedIn === null ? 'Not checked in yet' : checkedIn ? 'On duty' : 'Clocked out'

  if (!accessCode) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5] px-5 text-[#0A0A0B]">
      <form onSubmit={saveCode} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-[#111113] text-xs font-bold text-white">B</span><span className="text-sm font-semibold">BastionOS Guard</span></div>
        <h1 className="mt-5 text-xl font-semibold">Set up this phone</h1>
        <p className="mt-1 text-xs text-zinc-600">Enter the company code once. Your supervisor finds it in <b>Settings → Guard app access</b>. Every guard phone can use the same code — no manager login.</p>
        <label htmlFor="guard-app-code" className="mt-5 block text-[11px] font-semibold text-zinc-700">Company guard app code</label>
        <input id="guard-app-code" required value={codeDraft} onChange={(event) => setCodeDraft(event.target.value.toUpperCase())} placeholder="GRD-XXXX-XXXX" autoCapitalize="characters" className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 px-3 font-mono text-sm uppercase outline-none focus:border-zinc-500" />
        {codeError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{codeError}</p>}
        <button disabled={codePending} className="mt-4 h-11 w-full rounded-lg bg-[#111113] text-sm font-semibold text-white disabled:opacity-60">{codePending ? 'Checking…' : 'Use this code'}</button>
        <Link href="/sign-in" className="mt-3 block text-center text-[11px] font-semibold text-zinc-500 underline">I am a supervisor — sign in instead</Link>
      </form>
    </main>
  }

  return <main className="min-h-screen bg-[#F4F4F5] text-[#0A0A0B]">
    <header className="mx-auto flex h-14 max-w-[480px] items-center gap-3 px-4">
      <Link href="/sign-in" aria-label="Back" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200"><ChevronLeft className="size-5" /></Link>
      <div className="flex-1"><p className="text-xs font-bold">BastionOS Guard</p><p className="text-[9px] text-zinc-500">{organizationName || accessCode}</p></div>
      <button onClick={resetPhone} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-500 underline">Change code</button>
    </header>

    <div className="mx-auto max-w-[480px] px-4 pb-10">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-500">YOUR SHIFT</p>
            <p className="mt-1 text-lg font-semibold">{statusLabel}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-600"><MapPin className="size-3" />{siteName || 'Site appears after your first scan'}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${checkedIn ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}>{checkedIn ? 'On duty' : 'Off duty'}</span>
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">{guardName ? `${guardName} · ` : ''}Patrols every hour from {shiftLabel}.{patrolCount !== null ? ` ${patrolCount} checkpoint${patrolCount === 1 ? '' : 's'} today.` : ''}</p>

        <div className="mt-4 grid gap-2">
          <label className="text-[10px] font-semibold text-zinc-600" htmlFor="tag-token">Guard card tag code</label>
          <div className="flex gap-2">
            <input id="tag-token" value={tagToken} onChange={(event) => setTagToken(event.target.value.toUpperCase())} placeholder="BOS-XXXXXXXX" className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 font-mono text-sm uppercase outline-none focus:border-zinc-500" />
            <button onClick={() => { window.localStorage.removeItem('bastion.guardToken'); setTagToken('') }} className="rounded-lg border border-zinc-200 px-3 text-[11px] font-semibold">Clear</button>
          </div>
          <p className="text-[10px] text-zinc-500">Saved on this phone after the first scan, so you only scan the card once.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button onClick={() => void scanNfc('attendance')} disabled={busy !== null || activeScan !== null} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#111113] text-sm font-semibold text-white disabled:opacity-60">
            {checkedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />}{busy === 'attendance' ? 'Checking…' : checkedIn ? 'Clock out' : 'Clock in'}
          </button>
          <button onClick={() => void scanNfc('patrol')} disabled={busy !== null || activeScan !== null} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-sm font-semibold disabled:opacity-60">
            <Route className="size-4" />{busy === 'patrol' ? 'Saving…' : 'Log patrol'}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-500">{nfcAvailable === null ? 'Checking NFC support…' : nfcAvailable ? 'Hold the guard card on the phone, or type the tag code above and press the button.' : 'NFC is not available here — type the tag code above and press the button.'}</p>
        {activeScan && <button onClick={stopScan} className="mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 text-[11px] font-semibold"><X className="size-3.5" />Cancel scan</button>}
      </section>

      <section className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Emergency SOS</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">Raises a critical alert for your supervisors with your location. Use it only for a real emergency — for a fire, break-in, or injury call your supervisor too.</p>
          </div>
        </div>
        <button onClick={() => void sendSos()} disabled={busy !== null} className="mt-3 h-12 w-full rounded-xl bg-[#D64545] text-sm font-bold text-white disabled:opacity-60">
          {busy === 'sos' ? 'Sending…' : sosSent ? 'Send SOS again' : 'Send SOS'}
        </button>
        {sosSent && <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Check className="size-3.5" />Your supervisors have been alerted.</p>}
      </section>

      {message && <p role="status" className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[11px] text-zinc-700">{message}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] text-red-700">{error}</p>}

      <div className="mt-5 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Shift {shiftLabel}</span>
        <a href="tel:112" className="flex items-center gap-1.5 font-semibold text-zinc-900"><Phone className="size-3.5" />Call emergency services</a>
      </div>
    </div>
  </main>
}

function wallClock() {
  return new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
}
