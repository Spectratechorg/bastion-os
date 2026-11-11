'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock3,
  Compass,
  KeyRound,
  LogOut,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  ShieldAlert,
  X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/brand'
import { Avatar, Badge } from '@/components/ui-bits'
import { NfcDiagnostics } from '@/components/nfc-diagnostics'
import { WriteTagButton } from '@/components/write-tag-button'
import { decodeTagText as decodeRecord, tagHex } from '@/lib/nfc-decode'

interface NfcReader extends EventTarget {
  onreading: ((event: { message: { records: Array<{ recordType?: string; data?: DataView | string }> } }) => void) | null
  onreadingerror: (() => void) | null
  scan(options?: { signal?: AbortSignal }): Promise<void>
}
declare global {
  interface Window {
    NDEFReader?: new () => NfcReader
  }
}

type Action = 'attendance' | 'patrol' | 'sos'

type Today = {
  today: string
  hour: number
  shift: { startHour: number; endHour: number }
  slots: string[]
  checkedInAt: string | null
  checkedOutAt: string | null
  insideGeofence: boolean | null
  morning?: { deadline: string; signedAt: string | null; late: boolean; missed: boolean }
  closed?: boolean
  missedSlots?: string[]
  signed: Record<string, string>
}

type Schedule = Today & {
  guard: { id: string; name: string; guardCode: string | null; nin: string; site: string | null; photoUrl: string | null; status: string }
  assignedSite?: AssignedSite | null
}

type Identity = {
  id: string
  name: string
  guardCode?: string | null
  nin?: string
  status?: string
  site: string | null
  photoUrl: string | null
}

type AssignedSite = {
  id: string
  name: string
  latitude: number
  longitude: number
  geofenceRadius: number
}

type Me = {
  linked: boolean
  role: string
  guard?: Identity
  assignedSite?: AssignedSite | null
} & Partial<Today>

type TelemetryStatus = {
  onDuty: boolean
  withinBounds: boolean
  excessDistance?: number
  minutesAway?: number
  lastSyncedAt?: string
  message?: string
}

const CODE_KEY = 'bastion.guardCode'
const TAG_KEY = 'bastion.guardTag'
const clock = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
    : ''
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

type Fix = { latitude: number; longitude: number; accuracy?: number }

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/** One geolocation attempt. Resolves a reason instead of null so the app can say what went wrong. */
function attempt(highAccuracy: boolean, timeout: number): Promise<{ fix?: Fix; error?: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'This browser cannot report GPS location.' })
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          fix: {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
          },
        }),
      (e) =>
        resolve({
          error:
            e.code === e.PERMISSION_DENIED
              ? 'Location permission is blocked. Enable Location in your browser or phone settings, then reload.'
              : e.code === e.POSITION_UNAVAILABLE
                ? 'The phone cannot get a GPS fix. Step outside or near an open window and try again.'
                : 'Getting a GPS fix took too long. Please try again.',
        }),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 10_000 },
    )
  })
}

/** High accuracy first, then a cheaper fallback attempt. */
async function locate(): Promise<{ fix?: Fix; error?: string }> {
  const precise = await attempt(true, 12_000)
  if (precise.fix) return precise
  if (precise.error?.startsWith('Location permission is blocked')) return precise
  const coarse = await attempt(false, 15_000)
  return coarse.fix ? coarse : { error: precise.error ?? coarse.error }
}

/** Guard app. Supports Cardless GPS Check-in, Continuous Shift Telemetry, and NFC Fallback. */
export function GuardMobilePage() {
  const [me, setMe] = useState<Me | null>(null)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [company, setCompany] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [local, setLocal] = useState<{ who: Identity; today: Today } | null>(null)
  const [nfc, setNfc] = useState(false)
  const [scanning, setScanning] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [manual, setManual] = useState(false)
  const [token, setToken] = useState('')
  const [manualAction, setManualAction] = useState<Action>('attendance')
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [receipt, setReceipt] = useState<{
    action: Action
    guardName: string
    siteName: string | null
    withinBounds: boolean | null
    checkpoint?: string
    at: string
  } | null>(null)
  const [lastCode, setLastCode] = useState('')
  const [stage, setStage] = useState('')

  // Live Location & Proximity Tracking State
  const [currentFix, setCurrentFix] = useState<Fix | null>(null)
  const [distanceToSite, setDistanceToSite] = useState<number | null>(null)
  const [isInsideSite, setIsInsideSite] = useState<boolean | null>(null)
  const [telemetryStatus, setTelemetryStatus] = useState<TelemetryStatus | null>(null)
  const [isLocatingNow, setIsLocatingNow] = useState(false)

  const alertRef = useRef<HTMLDivElement>(null)
  const controller = useRef<AbortController | null>(null)

  const loadMe = useCallback(
    () =>
      fetch('/api/guard/me', { cache: 'no-store' })
        .then(async (r) => {
          if (!r.ok) {
            setSignedIn(false)
            return
          }
          setSignedIn(true)
          const data = (await r.json()) as Me
          setMe(data)
          if (data.linked && data.guard && data.slots) {
            setSchedule({ ...(data as unknown as Schedule), guard: { ...data.guard, guardCode: data.guard.guardCode ?? null, nin: data.guard.nin ?? '', status: data.guard.status ?? 'active' } })
          }
        })
        .catch(() => setSignedIn(false)),
    [],
  )

  useEffect(() => {
    void loadMe()
    const t = window.setInterval(() => {
      if (!document.hidden) void loadMe()
    }, 60000)
    return () => window.clearInterval(t)
  }, [loadMe])

  useEffect(() => {
    setNfc(Boolean(window.NDEFReader && window.isSecureContext))
    setCode(window.localStorage.getItem(CODE_KEY) ?? '')
    return () => controller.current?.abort()
  }, [])

  useEffect(() => {
    if (error || message || stage) alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error, message, stage])

  // Continuous geolocation watcher for phone coordinates
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCurrentFix({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setCurrentFix({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        })
      },
      (err) => {
        console.warn('Geolocation watch error:', err)
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Calculate live distance to assigned site whenever fix or site changes
  useEffect(() => {
    const site = me?.assignedSite
    if (site && currentFix) {
      const dist = calculateDistanceMeters(
        currentFix.latitude,
        currentFix.longitude,
        site.latitude,
        site.longitude,
      )
      setDistanceToSite(dist)
      setIsInsideSite(dist <= site.geofenceRadius)
    } else {
      setDistanceToSite(null)
      setIsInsideSite(null)
    }
  }, [me?.assignedSite, currentFix])

  const isGuard = me?.role === 'guard'
  const identity: Identity | null = me?.guard ?? local?.who ?? (schedule ? { id: schedule.guard.id, name: schedule.guard.name, guardCode: schedule.guard.guardCode, status: schedule.guard.status, site: schedule.guard.site, photoUrl: schedule.guard.photoUrl } : null)
  const today: Today | null = schedule ?? (me?.slots ? (me as Today) : local?.today ?? null)
  const ready = signedIn === true || Boolean(code)
  const checkedIn = Boolean(today?.checkedInAt) && !today?.checkedOutAt
  const checkedOut = Boolean(today?.checkedOutAt)

  // Continuous Shift GPS Telemetry Ping (Only while checked in on duty)
  useEffect(() => {
    if (!checkedIn || !currentFix) return

    let active = true

    const sendTelemetryPing = async () => {
      if (!currentFix || !active) return
      try {
        const res = await fetch('/api/guard/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: currentFix.latitude,
            longitude: currentFix.longitude,
            accuracy: currentFix.accuracy,
            guardId: identity?.id ?? undefined,
            code: signedIn ? undefined : code,
          }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (active) {
          setTelemetryStatus({
            onDuty: Boolean(data.onDuty),
            withinBounds: data.withinBounds !== false,
            excessDistance: data.excessDistance,
            minutesAway: data.minutesAway,
            lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            message: data.message,
          })
        }
      } catch (err) {
        console.warn('Shift telemetry sync error:', err)
      }
    }

    void sendTelemetryPing()

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void sendTelemetryPing()
      }
    }, 25000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [checkedIn, currentFix?.latitude, currentFix?.longitude, identity?.id, signedIn, code])

  async function refreshGps() {
    setIsLocatingNow(true)
    setError('')
    try {
      const located = await locate()
      if (located.fix) {
        setCurrentFix(located.fix)
      } else if (located.error) {
        setError(located.error)
      }
    } finally {
      setIsLocatingNow(false)
    }
  }

  async function saveCode(event: FormEvent) {
    event.preventDefault()
    setCodeError('')
    setCodeBusy(true)
    try {
      const response = await fetch('/api/guard/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeDraft }),
      })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error ?? 'That code was not accepted.')
      const clean = codeDraft.trim().toUpperCase()
      window.localStorage.setItem(CODE_KEY, clean)
      setCode(clean)
      setCompany(body.organizationName ?? '')
      setCodeDraft('')
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'That code was not accepted.')
    } finally {
      setCodeBusy(false)
    }
  }

  function forgetCode() {
    window.localStorage.removeItem(CODE_KEY)
    setCode('')
    setCompany('')
    setLocal(null)
    setMessage('')
  }

  async function loadSchedule(id = '') {
    setScheduleBusy(true); setScheduleError('')
    try {
      const response = id
        ? await fetch('/api/guard/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...(signedIn ? {} : { code }) }) })
        : await fetch('/api/guard/schedule', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error ?? 'Unable to load the patrol schedule.')
      setSchedule(body as Schedule)
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : 'Unable to load the patrol schedule.')
    } finally { setScheduleBusy(false) }
  }

  async function submit(action: Action, tag: string, options: { guardId?: string; slot?: string } = {}) {
    setBusy(true)
    setError('')
    setMessage('')
    setReceipt(null)
    setLastCode(tag.trim())
    setStage('Acquiring high-accuracy GPS fix…')
    try {
      const located = await locate()
      if (!located.fix) {
        throw new Error(
          located.error ??
            'Your GPS location could not be determined. Please enable location permissions or move near an open window and try again.',
        )
      }
      setCurrentFix(located.fix)
      setStage('Verifying site coordinates…')

      const response = await fetch('/api/guard/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: action,
          token: tag,
          ...located.fix,
          ...(signedIn ? {} : { code }),
          ...(options.guardId ? { guardId: options.guardId } : {}),
          ...(options.slot ? { slot: options.slot } : {}),
        }),
      })
      const body = await response.json()

      // STRICT BLOCKING HANDLING: If check-in was rejected due to off-site location
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not verify your location.')
      }

      if (tag) window.localStorage.setItem(TAG_KEY, tag.trim())

      setMessage(body.message)
      setReceipt({
        action,
        guardName: body.guardName ?? identity?.name ?? 'Guard',
        siteName: body.siteName ?? me?.assignedSite?.name ?? null,
        withinBounds: body.withinBounds ?? null,
        checkpoint: body.checkpoint,
        at: clock(new Date().toISOString()),
      })
      setManual(false)
      setToken('')

      if (body.status) {
        setLocal({
          who: {
            id: body.guardId ?? identity?.id ?? '',
            name: body.guardName,
            site: body.siteName ?? null,
            photoUrl: null,
          },
          today: body.status,
        })
        setSchedule((current) => current && current.guard.id === body.guardId ? { ...current, ...body.status } : current)
      }
      if (signedIn) void loadMe()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.')
    } finally {
      setStage('')
      setBusy(false)
    }
  }

  async function scan(action: Action) {
    if (action === 'sos') {
      const remembered = window.localStorage.getItem(TAG_KEY) ?? ''
      if (me?.linked || remembered) return void submit('sos', me?.linked ? '' : remembered)
      setError('To send SOS, please confirm your tag code below once so supervisors know who needs help.')
      setManualAction('sos')
      setManual(true)
      return
    }

    const Reader = window.NDEFReader
    if (!Reader) {
      setManualAction(action)
      return setManual(true)
    }
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setError('')
    setMessage('')
    setScanning(action)
    setStage('Hold your NFC tag flat against the back of your phone…')
    try {
      const reader = new Reader()
      reader.onreading = (event) => {
        const record = event.message.records.find((item) => item.data !== undefined && item.data !== null)
        const text = record ? decodeRecord(record).trim() : ''
        const hex = record ? tagHex(record) : ''
        abort.abort()
        setScanning(null)
        if (!text) {
          setStage('')
          setLastCode(hex || '(no payload)')
          setError(`That tag holds no readable guard code. Raw bytes: ${hex || '(nothing)'}.`)
          return
        }
        setLastCode(text)
        void submit(action, text)
      }
      reader.onreadingerror = () => {
        setError('That tag could not be read. Try again.')
        setScanning(null)
        setStage('')
      }
      await reader.scan({ signal: abort.signal })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError('NFC could not start. You can check in cardless or enter code.')
        setManualAction(action)
        setManual(true)
      }
      setScanning(null)
      setStage('')
    }
  }

  const stop = () => {
    controller.current?.abort()
    setScanning(null)
    setStage('')
  }

  const big =
    'flex min-h-[58px] w-full items-center justify-center gap-2 rounded-[12px] px-4 text-base font-semibold shadow-sm transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none'

  const slots = today?.slots ?? []
  const signed = today?.signed ?? {}
  const signedCount = slots.filter((slot) => signed[slot]).length
  const patrolDone = slots.length > 0 && signedCount >= slots.length
  const hour = today?.hour ?? 0
  const shift = today?.shift
  const windowOpen = shift ? (shift.endHour > shift.startHour ? hour >= shift.startHour && hour < shift.endHour : hour >= shift.startHour || hour < shift.endHour) : false

  const nextSlot = slots.find((slot) => !signed[slot])
  const currentSlot = shift && windowOpen ? hourLabel(hour) : null
  const isCurrentSlotSigned = currentSlot ? Boolean(signed[currentSlot]) : false

  const assignedSite = me?.assignedSite ?? schedule?.assignedSite ?? undefined
  const morning = today?.morning ?? schedule?.morning

  const step = (done: boolean, title: string, detail: string) => (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
          done ? 'bg-[#16794A] text-white shadow-sm' : 'border border-zinc-300 text-[#9A9AA1]'
        }`}
      >
        {done ? <Check className="size-3.5 stroke-[3]" /> : <Circle className="size-3.5" />}
      </span>
      <span>
        <b className="block text-sm font-semibold">{title}</b>
        <span className="text-xs text-[#6B6B72]">{detail}</span>
      </span>
    </li>
  )

  const scheduleCurrentSlot = schedule ? schedule.slots.find((slot) => Number(slot.slice(0, 2)) === schedule.hour) ?? null : null
  const scheduleCurrentIndex = schedule && scheduleCurrentSlot ? schedule.slots.indexOf(scheduleCurrentSlot) : -1
  const scheduleCanSign = Boolean(schedule && !schedule.closed && scheduleCurrentSlot && !schedule.signed[scheduleCurrentSlot])
  const greeting = (today?.hour ?? 12) < 12 ? 'Good morning' : (today?.hour ?? 12) < 17 ? 'Good afternoon' : 'Good evening'
  const shiftText = today?.shift ? `${hourLabel(today.shift.startHour)}–${hourLabel(today.shift.endHour)}` : null
  const dayLabel = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })
  const heroDay = new Date().toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })
  const locationBlocked = isInsideSite === false

  return (
    <main className="min-h-screen bg-[#F5F5F6] pb-16 text-[#18181B]">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-800 bg-[#1E1F22] px-4 text-white shadow-sm">
        <div className="flex items-center gap-2.5">
          {isGuard || (!signedIn && signedIn !== null) ? <span className="size-1" /> : <Link href="/overview" aria-label="Back to dashboard" className="flex size-10 items-center justify-center rounded-lg hover:bg-white/10"><ChevronLeft className="size-5" /></Link>}
          <Logo size={28} />
          <div className="flex flex-col"><span className="text-sm font-bold tracking-tight">BastionOS</span><span className="text-[10px] font-medium uppercase tracking-wider text-[#9A9AA1]">Guard mobile</span></div>
        </div>
        {isGuard ? <button onClick={() => void authClient.signOut().then(() => { window.location.href = '/sign-in' })} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium hover:bg-white/15"><LogOut className="size-3.5" />Sign out</button> : <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-[#D4D4D8]">Preview</span>}
      </header>

      <div ref={alertRef} className="mx-auto max-w-[460px] space-y-2 px-4 pt-4">
        {scanning && <button onClick={stop} className={`${big} border border-zinc-300 bg-white`}><X className="size-4" />Cancel scan</button>}
        {stage && <p role="status" className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-900"><RefreshCw className="size-4 animate-spin" />{stage}</p>}
        {busy && !stage && <p className="text-center text-xs text-[#6B6B72]">Connecting to server…</p>}
        {message && !busy && <div role="status" className="flex items-start gap-2.5 rounded-xl border border-[#16794A]/30 bg-[#E3F4EA] p-3.5 text-sm text-[#16794A]"><CheckCircle2 className="size-5 shrink-0" /><span>{message}</span></div>}
        {error && <div role="alert" className="rounded-[12px] border border-red-200 bg-[#FDECEA] p-4 text-sm text-[#B42318] shadow-sm"><div className="flex items-start gap-2.5"><AlertCircle className="size-5 shrink-0" /><div><p className="font-semibold">Action rejected</p><p className="mt-0.5 text-xs leading-relaxed text-red-900">{error}</p>{lastCode && <p className="mt-2 border-t border-red-200 pt-2 font-mono text-[10px] text-red-800">Tag: {lastCode}</p>}</div></div></div>}
      </div>

      <div className="mx-auto max-w-[460px] px-4 pt-4">
        {signedIn === null ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-[#6B6B72]"><RefreshCw className="mb-2 size-6 animate-spin text-[#16794A]" />Loading guard profile…</div>
        ) : !ready ? (
          <section className="ws-card overflow-hidden">
            <div className="bg-[#1E1F22] px-5 py-6 text-white">
              <span className="flex size-11 items-center justify-center rounded-[12px] bg-white/10"><KeyRound className="size-5" /></span>
              <h1 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.02em]">Start your shift</h1>
              <p className="mt-1.5 text-xs leading-5 text-[#C4C7CC]">Enter the company code from your supervisor, or sign in with your guard account.</p>
            </div>
            <form onSubmit={saveCode} className="grid gap-4 p-5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6B72]">Company code
                <input required value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase())} placeholder="GRD-XXXX-XXXX" autoCapitalize="characters" className="mt-2 h-12 w-full rounded-[10px] border border-[#E4E4E7] px-3 font-mono text-base tracking-wider outline-none focus:border-[#2A2B2E] focus:ring-2 focus:ring-[#2A2B2E]/10" />
              </label>
              {codeError && <p role="alert" className="text-xs font-medium text-[#B42318]">{codeError}</p>}
              <button disabled={codeBusy} className={`${big} bg-[#1E1F22] text-white hover:bg-zinc-800`}>{codeBusy ? 'Checking code…' : 'Use this code'}</button>
              <Link href="/sign-in" className="text-center text-xs font-semibold text-[#16794A] underline underline-offset-4">Sign in with my guard account</Link>
            </form>
          </section>
        ) : (
          <div className="space-y-4">
            {!signedIn && code && <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#E4E4E7] bg-white px-3 py-2 text-[11px] text-[#52525B]"><span>Company code <b className="font-mono text-[#18181B]">{code}</b>{company ? ` · ${company}` : ''}</span><button onClick={forgetCode} className="font-semibold text-[#16794A] underline">Change</button></div>}

            {identity ? (
              <section className="ws-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={identity.name} src={identity.photoUrl} size={58} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9A9AA1]">{greeting}</p>
                      <h1 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em]">{identity.name}</h1>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[#52525B]"><MapPin className="size-3.5 shrink-0 text-[#16794A]" />{assignedSite?.name ?? identity.site ?? 'No site assigned'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {identity.guardCode && <span className="rounded-[6px] bg-[#F0F2EC] px-2 py-1 font-mono text-[11px] font-semibold text-[#3F3F46]">{identity.guardCode}</span>}
                      {identity.status && <Badge value={identity.status} />}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-[10px] bg-[#F5F5F6] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A938B]">Today</p><p className="mt-1 text-[11.5px] font-medium">{heroDay}</p></div>
                    <div className="rounded-[10px] bg-[#F5F5F6] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A938B]">Shift</p><p className="mt-1 font-mono text-[11.5px] font-medium">{shiftText ?? '—'}</p></div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="space-y-3">
                {signedIn && me && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{isGuard ? 'Your login is not linked to a guard profile yet. Ask your supervisor to link it in BastionOS.' : 'You are previewing the guard app as administrative staff.'}</p>}
                <section className="ws-card p-5">
                  <h2 className="text-lg font-semibold tracking-[-0.01em]">Identify yourself</h2>
                  <p className="mt-1 text-xs leading-5 text-[#52525B]">Enter your 3-digit guard ID to load your site, shift and patrol schedule.</p>
                  <form onSubmit={(event) => { event.preventDefault(); void loadSchedule(scheduleId.trim()) }} className="mt-4 grid gap-2">
                    <input value={scheduleId} onChange={(event) => setScheduleId(event.target.value)} placeholder="e.g. 001" inputMode="numeric" aria-label="Guard ID for patrol schedule" className="h-12 w-full rounded-[10px] border border-[#E4E4E7] px-3 font-mono text-base outline-none focus:border-[#2A2B2E] focus:ring-2 focus:ring-[#2A2B2E]/10" />
                    <button disabled={scheduleBusy || !scheduleId.trim()} className={`${big} bg-[#1E1F22] text-white hover:bg-zinc-800`}>{scheduleBusy ? 'Looking up…' : 'Load my schedule'}</button>
                  </form>
                  {scheduleError && <p role="alert" className="mt-2 text-xs font-medium text-[#B42318]">{scheduleError}</p>}
                </section>
              </div>
            )}

            {assignedSite && (
              <section className="ws-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-[9px] bg-emerald-50 text-[#16794A]"><Compass className="size-4" /></span><div><p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#8A938B]">Assigned post</p><p className="text-sm font-semibold">{assignedSite.name}</p></div></div>
                  <button onClick={() => void refreshGps()} disabled={isLocatingNow} title="Refresh GPS" className="flex size-9 items-center justify-center rounded-[8px] border border-[#E4E4E7] text-[#52525B] hover:bg-[#F5F5F6]"><RefreshCw className={`size-3.5 ${isLocatingNow ? 'animate-spin text-[#16794A]' : ''}`} /></button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-[#F5F5F6] px-3 py-2.5">
                  <div><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A938B]">Geofence</p><p className="mt-0.5 font-mono text-[11.5px] text-[#52525B]">{assignedSite.geofenceRadius} m · {distanceToSite !== null ? `${distanceToSite} m away` : 'locating…'}</p></div>
                  {isInsideSite === true ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800"><CheckCircle2 className="size-3" />Inside</span> : isInsideSite === false ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-800"><AlertTriangle className="size-3" />Off-site</span> : <span className="text-[10px] text-[#8A938B]">Locating…</span>}
                </div>
                {!checkedIn && isInsideSite === false && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-[10.5px] leading-4 font-medium text-amber-800">Move inside the {assignedSite.geofenceRadius}m perimeter before signing in.</p>}
                {checkedIn && (
                  <div className={`mt-2.5 flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-[10.5px] ${telemetryStatus?.withinBounds === false ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>
                    <span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${telemetryStatus?.withinBounds === false ? 'bg-red-600' : 'bg-emerald-600'}`} />{telemetryStatus?.withinBounds === false ? `Outside perimeter by ${telemetryStatus.excessDistance ?? '—'} m` : 'GPS monitoring active'}</span>
                    {telemetryStatus?.lastSyncedAt && <span className="text-[9px] opacity-70">Synced {telemetryStatus.lastSyncedAt}</span>}
                  </div>
                )}
              </section>
            )}

            <section className="ws-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-[9px] bg-[#F0F2EC] text-[#3F3F46]"><Clock3 className="size-4" /></span><div><h2 className="text-[13px] font-semibold">Morning sign-in</h2><p className="mt-0.5 text-[10.5px] text-[#8A938B]">Attendance deadline 08:00</p></div></div>
                <Badge value={morning?.signedAt ? (morning.late ? 'Missed' : 'Signed') : morning?.missed ? 'Missed' : 'Pending'} />
              </div>
              <p className={`mt-3 rounded-[10px] p-3 text-[11px] leading-5 font-medium ${morning?.late ? 'bg-amber-50 text-amber-900' : morning?.missed ? 'bg-red-50 text-red-900' : 'bg-[#F5F5F6] text-[#52525B]'}`}>
                {morning?.signedAt ? `Signed at ${clock(morning.signedAt)}${morning.late ? ' · missed the 08:00 deadline (late sign-in accepted)' : ' · on time'}` : morning?.missed ? 'Not signed by 08:00. An alert has been raised — sign now.' : 'You are on time. Sign before 08:00.'}
              </p>
              {!checkedIn ? <div className="mt-3 grid gap-2">
                {identity ? <button className={`${big} bg-[#16794A] text-white hover:bg-emerald-700`} disabled={busy || scanning !== null || locationBlocked} onClick={() => void submit('attendance', '', { guardId: identity.id })}><Navigation className="size-5" />{locationBlocked ? 'Move on site to sign in' : checkedOut ? 'Check in again' : 'Sign morning attendance'}</button> : <p className="rounded-[10px] bg-[#F5F5F6] p-3 text-center text-[11px] text-[#52525B]">Identify yourself above to unlock morning sign-in.</p>}
                <p className="text-center text-[10px] text-[#8A938B]">GPS confirms you are inside your site geofence.</p>
              </div> : <div className="mt-3 grid gap-2">
                <p className="rounded-[10px] bg-emerald-50 px-3 py-2.5 text-[11px] font-medium text-emerald-900">On duty since {clock(today?.checkedInAt)}.</p>
                <button className={`${big} border border-[#E4E4E7] bg-white text-[#3F3F46] hover:bg-[#F5F5F6]`} disabled={busy || scanning !== null} onClick={() => void submit('attendance', '', { guardId: identity?.id })}><LogOut className="size-4 text-[#6B6B72]" />Check out of shift</button>
              </div>}
            </section>

            <section className="ws-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-[9px] bg-[#F0F2EC] text-[#3F3F46]"><Route className="size-4" /></span><div><h2 className="text-[13px] font-semibold">Daily patrol</h2><p className="mt-0.5 text-[10.5px] text-[#8A938B]">Hourly checkpoints from your shift</p></div></div>
                {schedule && <span className="font-mono text-[10.5px] tabular-nums text-[#52525B]">{Object.keys(schedule.signed).length}/{schedule.slots.length}</span>}
              </div>

              {!schedule ? (
                <div className="mt-3 rounded-[10px] bg-[#F5F5F6] p-3 text-[11px] leading-5 text-[#52525B]">
                  {scheduleBusy ? 'Loading your patrol schedule…' : identity ? <button type="button" className="font-semibold text-[#16794A] underline" onClick={() => void loadSchedule(identity.id)}>Load my patrol schedule</button> : 'Load your guard schedule above to see today’s checkpoints.'}
                  {scheduleError && <p role="alert" className="mt-1 text-[#B42318]">{scheduleError}</p>}
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#6B6B72]"><span>{schedule.guard.name} · {schedule.guard.site ?? 'No site'}</span><span className="font-mono">Shift {hourLabel(schedule.shift.startHour)}–{hourLabel(schedule.shift.endHour)}</span></div>
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {schedule.slots.map((slot) => {
                      const signed = schedule.signed[slot]
                      const missed = !signed && (schedule.missedSlots ?? []).includes(slot)
                      const current = slot === scheduleCurrentSlot
                      return <div key={slot} className={`flex min-h-[46px] flex-col items-center justify-center rounded-[8px] border px-1 text-[9.5px] ${signed ? 'border-[#16794A] bg-[#16794A] font-semibold text-white' : current && !schedule.closed ? 'border-amber-500 bg-amber-50 font-bold text-amber-950 ring-2 ring-amber-400/50' : missed ? 'border-[#F0C7C1] bg-[#FDECEA] text-[#B42318]' : 'border-[#E4E4E7] bg-[#FAFAFA] text-[#8A938B]'}`}><b className="font-mono text-[10px]">{slot}</b><span>{signed ? clock(signed) : missed ? 'Missed' : current && !schedule.closed ? 'Due now' : '—'}</span></div>
                    })}
                  </div>
                  {schedule.closed ? <p className="mt-2 rounded-lg bg-[#F5F5F6] p-2.5 text-[10.5px] text-[#52525B]">This shift has ended. Missed checkpoints remain on record.</p> : scheduleCanSign ? <button className={`${big} mt-3 bg-[#16794A] text-white hover:bg-emerald-700`} disabled={busy || scanning !== null || locationBlocked} onClick={() => void submit('patrol', '', { guardId: schedule.guard.id, slot: scheduleCurrentSlot! })}><CheckCircle2 className="size-5" />{locationBlocked ? 'Move on site to sign patrol' : `Sign ${scheduleCurrentSlot} patrol check-in`}</button> : scheduleCurrentSlot && schedule.signed[scheduleCurrentSlot] ? <p className="mt-2 flex items-center justify-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-medium text-emerald-900"><CheckCircle2 className="size-4" />{scheduleCurrentSlot} checkpoint signed. Next hour opens at {hourLabel((Number(scheduleCurrentSlot.slice(0, 2)) + 1) % 24)}.</p> : <p className="mt-2 rounded-lg bg-[#F5F5F6] p-2.5 text-[10.5px] text-[#52525B]">Patrol check-ins open during the shift.</p>}

                  <details className="mt-3 rounded-[10px] border border-[#E4E4E7] bg-[#FAFAFB] px-3 py-2.5">
                    <summary className="cursor-pointer list-none text-[10.5px] font-semibold text-[#52525B]">Link your guard ID to an NFC tag</summary>
                    <p className="mt-1 text-[10px] leading-4 text-[#6B6B72]">Write this guard’s ID onto their tag so a tap identifies them.</p>
                    <WriteTagButton token={schedule.guard.guardCode || schedule.guard.nin} owner={schedule.guard.name} writeLabel="Write ID to NFC tag" />
                  </details>
                </div>
              )}
            </section>

            {receipt && !busy && <div role="status" className="rounded-xl border border-[#E4E4E7] bg-white p-3.5 text-xs shadow-sm"><p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#6B6B72]">{receipt.action === 'attendance' ? 'Attendance confirmed' : receipt.action === 'patrol' ? 'Patrol checkpoint recorded' : 'SOS transmitted'}</p><dl className="mt-2 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1.5"><dt className="text-[#6B6B72]">Guard</dt><dd className="font-semibold">{receipt.guardName}</dd><dt className="text-[#6B6B72]">Site</dt><dd>{receipt.siteName ?? 'No site assigned'}</dd><dt className="text-[#6B6B72]">Time</dt><dd className="font-mono">{receipt.at}</dd>{receipt.checkpoint && <><dt className="text-[#6B6B72]">Checkpoint</dt><dd className="font-mono font-semibold">{receipt.checkpoint}</dd></>}<dt className="text-[#6B6B72]">Location</dt><dd className={receipt.withinBounds === false ? 'font-semibold text-[#B42318]' : 'font-medium text-[#16794A]'}>{receipt.withinBounds === false ? 'Outside geofence' : 'Verified on site'}</dd></dl></div>}

            <details className="ws-card px-4 py-3">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-[#52525B]">NFC &amp; manual fallback</summary>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#52525B]"><button type="button" onClick={() => void scan('attendance')} className="flex items-center gap-1.5 font-semibold hover:underline"><Radio className="size-3.5" />{nfc ? 'Scan NFC tag' : 'NFC tag'}</button><button type="button" onClick={() => setManual((m) => !m)} className="flex items-center gap-1.5 font-semibold hover:underline"><KeyRound className="size-3.5" />Type tag code</button></div>
              {manual && <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) void submit(manualAction, token.trim()) }} className="mt-3 grid gap-2.5 rounded-[10px] border border-[#E4E4E7] bg-[#FAFAFB] p-3"><label className="text-[10px] font-semibold text-[#52525B]">Action<select value={manualAction} onChange={(e) => setManualAction(e.target.value as Action)} className="mt-1 h-10 w-full rounded-lg border border-[#E4E4E7] bg-white px-2 text-sm"><option value="attendance">Check in or out</option><option value="patrol">Patrol checkpoint</option><option value="sos">Emergency SOS</option></select></label><label className="text-[10px] font-semibold text-[#52525B]">Tag code<input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. 9f2b7c41-…" className="mt-1 h-10 w-full rounded-lg border border-[#E4E4E7] bg-white px-3 font-mono text-sm" /></label><button disabled={busy || !token.trim()} className={`${big} min-h-[44px] bg-[#1E1F22] text-white hover:bg-zinc-800`}>Submit code</button></form>}
              <div className="mt-3"><NfcDiagnostics /></div>
            </details>

            <section className="rounded-[12px] border border-[#E9CFC9] bg-[#FDECEA] p-4">
              <h2 className="text-[12px] font-semibold text-[#8C2B1E]">Emergency</h2>
              <p className="mt-1 text-[10.5px] leading-4 text-[#8C2B1E]/80">Use only when you or someone else is in immediate danger. Supervisors receive your live location.</p>
              <button onClick={() => { if (window.confirm('Send an emergency SOS alert with your live coordinates to supervisors now?')) void submit('sos', '') }} disabled={busy || scanning !== null} className={`${big} mt-3 bg-[#B42318] text-white hover:bg-red-700`}><ShieldAlert className="size-5" />Send SOS</button>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
