'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, Bell, Check, ChevronLeft, Clock3, Grid2X2, MapPin, Route, Shield, Users, X } from 'lucide-react'

interface NfcReadingEvent extends Event {
  message: {
    records: Array<{ recordType: string; data?: string | Uint8Array }>
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
  const [nfcAvailable, setNfcAvailable] = useState(false)
  const [activeScan, setActiveScan] = useState<ScanAction | null>(null)
  const [checkedIn, setCheckedIn] = useState(true)
  const [lastScan, setLastScan] = useState('Checked in via NFC · Gate 1')
  const [patrolCount, setPatrolCount] = useState(7)
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
      const record = event.message.records[0]
      const tokenFromRecord = (() => {
        if (!record) return ''
        if (typeof record.data === 'string') return record.data
        if (record.data instanceof Uint8Array) return new TextDecoder().decode(record.data)
        return ''
      })().trim()

      const token = tokenFromRecord || `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      setLastScan(record ? `NFC token read · ${record.recordType}` : 'NFC tag read')
      setSubmitting(true)

      try {
        const response = await fetch('/api/guard/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: action, token, latitude: 6.4281, longitude: 3.4219 }),
        })
        const payload = await response.json()

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? 'Unable to verify the NFC token.')
        }

        setMessage(payload.message ?? 'NFC verification succeeded.')
        if (action === 'attendance') setCheckedIn((current) => !current)
        if (action === 'patrol') setPatrolCount((current) => Math.min(current + 1, 9))
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Unable to verify the NFC token.'
        setError(reason)
        setMessage('Verification failed. Register the token in the organization and try again.')
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

  const sendSos = () => setMessage('SOS is not connected yet. This offline preview cannot contact your operations team.')

  return (
    <main className="min-h-screen bg-[#F4F4F5] text-[#0A0A0B]">
      <header className="mx-auto flex h-14 max-w-[480px] items-center gap-3 px-4">
        <Link href="/guards" aria-label="Back to operations" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200"><ChevronLeft className="size-5" /></Link>
        <span className="flex size-7 items-center justify-center rounded-lg bg-[#111113] text-xs font-bold text-white">B</span>
        <div className="flex-1"><p className="text-xs font-bold">BastionOS Guard</p><p className="text-[9px] text-zinc-500">MOBILE EXPERIENCE</p></div>
        <button aria-label="Notifications" className="rounded-lg p-2 text-zinc-600"><Bell className="size-4" /></button>
      </header>

      <div className="mx-auto max-w-[480px] px-4 pb-8">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-900">
          Registered NFC tokens are verified against your active organization before attendance or patrol actions are accepted.
        </div>

        <p className="text-[11px] text-zinc-500">Good morning</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">Musa Adamu</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500"><MapPin className="size-3" />Eko Atlantic Tower · Day shift</p>

        <section className="mt-5 rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-500">SHIFT STATUS</p>
            <span className="rounded-full bg-[#E8E8EA] px-2.5 py-1 text-[9px] font-semibold text-zinc-800">● Inside geofence · sample</span>
          </div>
          <p className="mt-3 text-[18px] font-medium">{checkedIn ? '06:54 — 19:00' : 'Shift ended locally'}</p>
          <p className="mt-1 text-[10px] text-zinc-500">{lastScan}</p>
          <button
            onClick={() => void scanNfc('attendance')}
            disabled={activeScan !== null}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#111113] px-3 text-xs font-semibold text-white disabled:opacity-70"
          >
            {submitting || activeScan === 'attendance' ? <><span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Verifying tag…</> : checkedIn ? '▣ Scan NFC to check out' : '▣ Scan NFC to check in'}
          </button>
          {activeScan === 'attendance' && <button onClick={stopScan} className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 text-[11px] font-semibold text-zinc-700"><X className="size-3.5" />Cancel scan</button>}
        </section>

        <div className="my-6 flex flex-col items-center">
          <button onClick={sendSos} aria-label="Emergency SOS unavailable offline" className="flex size-[86px] flex-col items-center justify-center rounded-full bg-[#D64545] text-white shadow-[0_0_0_10px_rgba(214,69,69,0.14)]">
            <strong className="text-[22px]">SOS</strong><span className="text-[7px]">Hold for emergency</span>
          </button>
          <p className="mt-3 text-[9px] text-zinc-500">Emergency dispatch unavailable offline</p>
        </div>

        <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Perimeter patrol</h2><span className="text-[11px] font-semibold">{patrolCount} of 9</span></div>
          <div className="mt-3 h-1.5 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-[#111113] transition-[width]" style={{ width: `${(patrolCount / 9) * 100}%` }} /></div>
          <p className="mt-2 text-[9px] text-zinc-500">Next: Loading bay checkpoint</p>
          <button
            onClick={() => void scanNfc('patrol')}
            disabled={activeScan !== null || patrolCount >= 9}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-zinc-200 text-[11px] font-semibold disabled:opacity-60"
          >
            {submitting || activeScan === 'patrol' ? 'Verifying checkpoint…' : patrolCount >= 9 ? <><Check className="size-4" />Patrol complete locally</> : 'Scan NFC checkpoint ›'}
          </button>
        </section>
        {activeScan === 'patrol' && <button onClick={stopScan} className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700"><X className="size-3.5" />Cancel scan</button>}

        {message && <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-700">{message}</p>}
        {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>}

        <nav className="mt-7 flex items-center justify-between rounded-2xl border border-[#E4E4E7] bg-[#111113] px-5 py-3 text-white shadow-[0_12px_30px_rgba(7,10,11,0.15)]">
          <button aria-label="Dashboard" className="rounded-xl bg-white/5 p-2"><Grid2X2 className="size-4" /></button>
          <button aria-label="Patrol" onClick={() => void scanNfc('patrol')}><Route className="size-4" /></button>
          <span className="-mt-8 flex size-9 items-center justify-center rounded-full bg-[#111113] font-serif italic text-white"><Activity className="size-4" /></span>
          <button aria-label="Attendance"><Clock3 className="size-4" /></button>
          <button aria-label="My profile"><Users className="size-4" /></button>
        </nav>
        <Link href="/guards" className="mt-4 block text-center text-[10px] font-semibold text-zinc-500">Back to operations dashboard</Link>
      </div>
    </main>
  )
}
