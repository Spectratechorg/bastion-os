'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, Bell, ChevronLeft, Clock3, Grid2X2, MapPin, Route, Users, X } from 'lucide-react'

interface NfcReadingEvent extends Event {
  message: {
    records: Array<{ recordType: string; data?: DataView | null; encoding?: string; lang?: string }>
  }
}

interface NfcReader extends EventTarget {
  onreading: ((event: NfcReadingEvent) => void) | null
  onreadingerror: (() => void) | null
  scan(options?: { signal?: AbortSignal }): Promise<void>
}

declare global {
  interface Window {
    NDEFReader?: new () => NfcReader
  }
}

type ScanAction = 'attendance' | 'patrol'

export function GuardMobilePage() {
  const [nfcAvailable, setNfcAvailable] = useState<boolean | null>(null)
  const [activeScan, setActiveScan] = useState<ScanAction | null>(null)
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null)
  const [lastScan, setLastScan] = useState('No scans recorded yet.')
  const [patrolCount, setPatrolCount] = useState(0)
  const [guardName, setGuardName] = useState('')
  const [siteName, setSiteName] = useState('')
  const [withinBounds, setWithinBounds] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    setNfcAvailable(Boolean(window.NDEFReader && window.isSecureContext))
    return () => controller.current?.abort()
  }, [])

  const stopScan = () => {
    controller.current?.abort()
    controller.current = null
    setActiveScan(null)
  }

  const scanNfc = async (action: ScanAction) => {
    const Reader = window.NDEFReader
    if (!Reader) {
      setError('NFC scanning is not supported by this browser. Use Chrome on an NFC-capable Android phone.')
      return
    }
    if (!window.isSecureContext) {
      setError('NFC requires a secure HTTPS connection. Open this page on localhost or an HTTPS address.')
      return
    }

    stopScan()
    setError('')
    setMessage('Hold an NFC tag near the back of your phone.')
    setActiveScan(action)
    const abortController = new AbortController()
    controller.current = abortController
    const reader = new Reader()
    reader.onreading = async (event) => {
      const record = event.message.records.find((candidate) => candidate.recordType === 'text' && candidate.data)
      if (!record?.data) {
        setError('Tag read, but it has no NDEF text token. Write the registered guard token as a text record and try again.')
        setMessage('NFC hardware read succeeded; token verification was not attempted.')
        abortController.abort()
        controller.current = null
        setActiveScan(null)
        return
      }

      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)
      const languageLength = (bytes[0] ?? 0) & 0x3f
      const token = new TextDecoder(record.encoding || 'utf-8').decode(bytes.subarray(1 + languageLength)).trim()
      if (!token) {
        setError('The NFC text record is empty. Write the registered guard token and try again.')
        setMessage('NFC hardware read succeeded; token verification was not attempted.')
        abortController.abort()
        controller.current = null
        setActiveScan(null)
        return
      }

      setLastScan(`NDEF text token read · ${record.lang || 'text'}`)
      setMessage('NFC tag read successfully. Checking whether the token is registered…')
      setSubmitting(true)

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Location is unavailable in this browser. Allow location access to verify the site boundary.'))
            return
          }
          navigator.geolocation.getCurrentPosition(resolve, () => {
            reject(new Error('Location access is required to verify the assigned site. Allow location access and scan again.'))
          }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 })
        })
        const response = await fetch('/api/guard/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: action,
            token,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        })
        const payload = await response.json()

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? 'Unable to verify the NFC token.')
        }

        setMessage(payload.withinBounds ? payload.message : `${payload.message} The scan was saved but is outside the assigned site geofence.`)
        setGuardName(payload.guardName ?? '')
        setSiteName(payload.siteName ?? '')
        setWithinBounds(Boolean(payload.withinBounds))
        if (action === 'attendance') setCheckedIn(Boolean(payload.checkedIn))
        if (action === 'patrol') setPatrolCount(Number(payload.patrolCount ?? patrolCount + 1))
        setLastScan(payload.message ?? 'NFC verification succeeded.')
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Unable to verify the NFC token.'
        setError(reason)
        setMessage('The phone read the NFC text token, but the server did not verify it.')
      } finally {
        setSubmitting(false)
        abortController.abort()
        controller.current = null
        setActiveScan(null)
      }
    }
    reader.onreadingerror = () => {
      setError('The tag could not be read. Hold a compatible NFC tag steadily near your phone and try again.')
      abortController.abort()
      controller.current = null
      setActiveScan(null)
    }

    try {
      await reader.scan({ signal: abortController.signal })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Unable to start NFC scanning.')
      setActiveScan(null)
      controller.current = null
    }
  }

  const sendSos = () => setMessage('Emergency dispatch is not configured yet. Contact your supervisor directly.')

  return (
    <main id="top" className="min-h-screen bg-[#F4F4F5] text-[#0A0A0B]">
      <header className="mx-auto flex h-14 max-w-[480px] items-center gap-3 px-4">
        <Link href="/guards" aria-label="Back to operations" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200"><ChevronLeft className="size-5" /></Link>
        <span className="flex size-7 items-center justify-center rounded-lg bg-[#111113] text-xs font-bold text-white">B</span>
        <div className="flex-1"><p className="text-xs font-bold">BastionOS Guard</p><p className="text-[9px] text-zinc-500">MOBILE EXPERIENCE</p></div>
        <Link href="/alerts" aria-label="Notifications" className="rounded-lg p-2 text-zinc-600"><Bell className="size-4" /></Link>
      </header>

      <div className="mx-auto max-w-[480px] px-4 pb-8">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-900">
          Sign in with an organization account, allow location access, then scan a registered guard NFC text token.
        </div>
        <p className="mb-3 text-[10px] text-zinc-600" role="status">
          {nfcAvailable === null ? 'Checking NFC support…' : nfcAvailable ? 'NFC reader available in this secure browser.' : 'NFC requires Chrome on NFC-capable Android over HTTPS.'}
        </p>

        <p className="text-[11px] text-zinc-500">Guard field app</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">{guardName || 'Ready to scan'}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500"><MapPin className="size-3" />{siteName || 'Your assigned site appears after a verified scan'}</p>

        <section className="mt-5 rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-500">SHIFT STATUS</p>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${withinBounds === null ? 'bg-[#E8E8EA] text-zinc-800' : withinBounds ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
              {withinBounds === null ? 'Location not checked' : withinBounds ? 'Inside assigned geofence' : 'Outside assigned geofence'}
            </span>
          </div>
          <p className="mt-3 text-[18px] font-medium">{checkedIn === null ? 'Scan to check attendance status' : checkedIn ? 'Currently checked in' : 'Not checked in'}</p>
          <p className="mt-1 text-[10px] text-zinc-500">{lastScan}</p>
          <button
            onClick={() => void scanNfc('attendance')}
            disabled={activeScan !== null}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#111113] px-3 text-xs font-semibold text-white disabled:opacity-70"
          >
            {submitting || activeScan === 'attendance' ? <><span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Verifying tag…</> : '▣ Scan NFC for check-in or check-out'}
          </button>
          {activeScan === 'attendance' && <button onClick={stopScan} className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 text-[11px] font-semibold text-zinc-700"><X className="size-3.5" />Cancel scan</button>}
        </section>

        <div className="my-6 flex flex-col items-center">
          <button onClick={sendSos} aria-label="Emergency SOS unavailable offline" className="flex size-[86px] flex-col items-center justify-center rounded-full bg-[#D64545] text-white shadow-[0_0_0_10px_rgba(214,69,69,0.14)]">
            <strong className="text-[22px]">SOS</strong><span className="text-[7px]">Hold for emergency</span>
          </button>
          <p className="mt-3 text-[9px] text-zinc-500">Emergency dispatch is not configured</p>
        </div>

        <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Patrol activity</h2><span className="text-[11px] font-semibold">{patrolCount} today</span></div>
          <p className="mt-3 text-[9px] text-zinc-500">Each scan records the guard, time, location and assigned site.</p>
          <button
            onClick={() => void scanNfc('patrol')}
            disabled={activeScan !== null}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-zinc-200 text-[11px] font-semibold disabled:opacity-60"
          >
            {submitting || activeScan === 'patrol' ? 'Verifying patrol scan…' : 'Scan NFC to log patrol ›'}
          </button>
        </section>
        {activeScan === 'patrol' && <button onClick={stopScan} className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700"><X className="size-3.5" />Cancel scan</button>}

        {message && <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-700">{message}</p>}
        {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>}

        <nav className="mt-7 flex items-center justify-between rounded-2xl border border-[#E4E4E7] bg-[#111113] px-5 py-3 text-white shadow-[0_12px_30px_rgba(7,10,11,0.15)]">
          <a href="#top" aria-label="Dashboard" className="rounded-xl bg-white/5 p-2"><Grid2X2 className="size-4" /></a>
          <button aria-label="Patrol" onClick={() => void scanNfc('patrol')}><Route className="size-4" /></button>
          <span className="-mt-8 flex size-9 items-center justify-center rounded-full bg-[#111113] font-serif italic text-white"><Activity className="size-4" /></span>
          <button aria-label="Attendance" onClick={() => void scanNfc('attendance')}><Clock3 className="size-4" /></button>
          <Link aria-label="My profile" href="/profile"><Users className="size-4" /></Link>
        </nav>
        <Link href="/guards" className="mt-4 block text-center text-[10px] font-semibold text-zinc-500">Back to operations dashboard</Link>
      </div>
    </main>
  )
}
