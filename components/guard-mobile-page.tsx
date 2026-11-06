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
  Compass,
  KeyRound,
  LogOut,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/brand'
import { Avatar } from '@/components/ui-bits'
import { NfcDiagnostics } from '@/components/nfc-diagnostics'
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
  signed: Record<string, string>
}

type Identity = {
  id: string
  name: string
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
    if (error) alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

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
  const identity: Identity | null = me?.guard ?? local?.who ?? null
  const today: Today | null = me?.slots ? (me as Today) : local?.today ?? null
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

  async function submit(action: Action, tag: string) {
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
    'flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold shadow-sm transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none'

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

  const assignedSite = me?.assignedSite

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

  return (
    <main className="min-h-screen bg-[#F5F5F6] pb-12 text-[#18181B]">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-800 bg-[#1E1F22] px-4 text-white shadow-sm">
        <div className="flex items-center gap-2.5">
          {isGuard || (!signedIn && signedIn !== null) ? (
            <span className="size-1" />
          ) : (
            <Link
              href="/overview"
              aria-label="Back to dashboard"
              className="flex size-10 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <ChevronLeft className="size-5" />
            </Link>
          )}
          <Logo size={28} />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">BastionOS</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Guard Mobile</span>
          </div>
        </div>

        {isGuard && (
          <button
            onClick={() =>
              void authClient.signOut().then(() => {
                window.location.href = '/sign-in'
              })
            }
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium hover:bg-white/15"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        )}
      </header>

      <div className="mx-auto max-w-[480px] px-4 pt-4">
        {signedIn === null ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-[#6B6B72]">
            <RefreshCw className="mb-2 size-6 animate-spin text-[#16794A]" />
            Loading guard profile…
          </div>
        ) : !ready ? (
          <form onSubmit={saveCode} className="grid gap-3 rounded-2xl border border-[#E4E4E7] bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold">Set up this phone</h1>
            <p className="text-xs leading-5 text-[#52525B]">
              Enter the company guard app code your supervisor provided. You only do this once. Or{' '}
              <Link href="/sign-in" className="font-semibold text-emerald-700 underline">
                sign in
              </Link>{' '}
              with your guard login.
            </p>
            <input
              required
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
              placeholder="GRD-XXXX-XXXX"
              autoCapitalize="characters"
              className="h-12 rounded-xl border border-zinc-300 px-3 font-mono text-base tracking-wider"
            />
            {codeError && <p role="alert" className="text-xs font-medium text-[#B42318]">{codeError}</p>}
            <button disabled={codeBusy} className={`${big} bg-[#1E1F22] text-white hover:bg-zinc-800`}>
              {codeBusy ? 'Checking code…' : 'Use this code'}
            </button>
          </form>
        ) : (
          <>
            {/* Shared Guard App Code Banner */}
            {!signedIn && code && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-[11px] text-[#52525B]">
                <span>
                  Company code <b className="font-mono text-zinc-900">{code}</b>
                  {company ? ` · ${company}` : ''}
                </span>
                <button onClick={forgetCode} className="font-semibold text-emerald-700 underline">
                  Change
                </button>
              </div>
            )}

            {/* Guard Identity Profile Card */}
            {identity ? (
              <section className="mb-4 flex items-center gap-3 rounded-2xl border border-[#E4E4E7] bg-white p-3.5 shadow-sm">
                <Avatar name={identity.name} src={identity.photoUrl} size={54} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-[#6B6B72]">On Duty Guard</p>
                  <p className="truncate text-lg font-semibold leading-tight text-zinc-900">{identity.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#52525B]">
                    <MapPin className="size-3.5 shrink-0 text-emerald-700" />
                    <span className="truncate">{assignedSite ? assignedSite.name : identity.site ?? 'No site assigned yet'}</span>
                  </p>
                </div>
              </section>
            ) : signedIn && me ? (
              <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {isGuard
                  ? 'Your login is not linked to a guard profile yet. Ask your supervisor to link it in BastionOS.'
                  : 'You are previewing the guard app as administrative staff.'}
              </p>
            ) : (
              <p className="mb-4 text-xs text-[#6B6B72]">
                Your site and name will appear as soon as your account is identified.
              </p>
            )}

            {/* LIVE GPS SITE PROXIMITY CARD */}
            {assignedSite && (
              <section className="mb-4 rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <Compass className="size-4" />
                    </span>
                    <div>
                      <h2 className="text-xs font-semibold tracking-wide text-[#6B6B72] uppercase">Assigned Site</h2>
                      <p className="text-sm font-bold text-zinc-900">{assignedSite.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => void refreshGps()}
                    disabled={isLocatingNow}
                    title="Refresh GPS"
                    className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    <RefreshCw className={`size-3.5 ${isLocatingNow ? 'animate-spin text-emerald-700' : ''}`} />
                  </button>
                </div>

                <div className="mt-3 grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B6B72]">Geofence Radius:</span>
                    <span className="font-medium text-zinc-800">{assignedSite.geofenceRadius} meters perimeter</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#6B6B72]">Your Distance:</span>
                    <span className="font-mono font-semibold">
                      {distanceToSite !== null ? `${distanceToSite} m` : 'Calculating…'}
                    </span>
                  </div>

                  {/* Proximity Status Pill */}
                  <div className="mt-1 flex items-center justify-between border-t border-zinc-200/80 pt-2">
                    <span className="text-[11px] font-medium text-[#6B6B72]">Site Location Check:</span>
                    {isInsideSite === true ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <CheckCircle2 className="size-3.5" />
                        Within Site Geofence
                      </span>
                    ) : isInsideSite === false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
                        <AlertTriangle className="size-3.5" />
                        Off-Site ({distanceToSite !== null ? `${Math.max(0, distanceToSite - assignedSite.geofenceRadius)}m outside` : 'outside perimeter'})
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-500">Acquiring GPS fix…</span>
                    )}
                  </div>
                </div>

                {!checkedIn && isInsideSite === false && (
                  <p className="mt-2.5 rounded-lg bg-amber-50 p-2 text-center text-[11px] leading-relaxed font-medium text-amber-800">
                    ⚠️ Strict Check-in: You must be inside the {assignedSite.geofenceRadius}m perimeter of {assignedSite.name} to check in.
                  </p>
                )}
              </section>
            )}

            {/* LIVE SHIFT RADAR & TELEMETRY (WHEN CHECKED IN) */}
            {checkedIn && (
              <section
                className={`mb-4 rounded-2xl border p-4 shadow-sm transition-all ${
                  telemetryStatus?.withinBounds === false
                    ? 'border-red-300 bg-red-50 text-red-950'
                    : 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-3">
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                          telemetryStatus?.withinBounds === false ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={`relative inline-flex size-3 rounded-full ${
                          telemetryStatus?.withinBounds === false ? 'bg-red-600' : 'bg-emerald-600'
                        }`}
                      />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {telemetryStatus?.withinBounds === false
                        ? 'Perimeter Breach Detected'
                        : 'Shift GPS Telemetry Active'}
                    </span>
                  </div>
                  {telemetryStatus?.lastSyncedAt && (
                    <span className="text-[10px] text-zinc-500">Synced {telemetryStatus.lastSyncedAt}</span>
                  )}
                </div>

                {telemetryStatus?.withinBounds === false ? (
                  <div className="mt-2 text-xs leading-relaxed">
                    <p className="font-semibold text-red-800">
                      You are {telemetryStatus.excessDistance ?? '–'}m outside the site boundary.
                    </p>
                    <p className="mt-0.5 text-red-700">
                      Elapsed departure: <b>{telemetryStatus.minutesAway ?? 1} minute(s)</b>. Your supervisor has been alerted with your live location. Please return to your post immediately.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-emerald-800">
                    Continuous monitoring active. You are verified on-post at {assignedSite?.name ?? 'your site'}.
                  </p>
                )}
              </section>
            )}

            {/* TODAY'S SHIFT OVERVIEW */}
            <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold tracking-wide text-[#6B6B72] uppercase">Today&apos;s Shift</h2>
              <ol className="mt-3 grid gap-3">
                {step(
                  checkedIn,
                  checkedIn
                    ? `Checked in at ${clock(today?.checkedInAt)}`
                    : checkedOut
                      ? `Checked out at ${clock(today?.checkedOutAt)}`
                      : 'Shift Check In',
                  checkedIn
                    ? 'You are active on duty. GPS tracking is live.'
                    : checkedOut
                      ? 'Your shift is completed for today.'
                      : 'Tap Verify Location & Check In when at your post.',
                )}
                {step(
                  patrolDone,
                  `Hourly Patrol Check-in: ${signedCount} of ${slots.length || '–'} signed`,
                  shift
                    ? `Hourly stay-awake patrol checks from ${hourLabel(shift.startHour)} to ${hourLabel(shift.endHour)}. You must be at your post every hour.`
                    : 'Checkpoints open during shift hours.',
                )}
              </ol>

              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50 p-2.5 text-xs text-amber-900">
                <Radio className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div>
                  <span className="font-semibold">Stay-Awake Vigilance Verification:</span> Guards must check in every hour during shift while physically at post. Off-post signing is strictly blocked.
                </div>
              </div>

              {slots.length > 0 && (
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {slots.map((slot) => (
                    <span
                      key={slot}
                      className={`flex min-h-[46px] flex-col items-center justify-center rounded-xl border text-xs ${
                        signed[slot]
                          ? 'border-emerald-600 bg-emerald-600 text-white font-semibold'
                          : slot === currentSlot ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold ring-2 ring-amber-400/60' : 'border-[#E4E4E7] text-[#6B6B72] bg-zinc-50'
                      }`}
                    >
                      <b className="font-mono text-[11px]">{slot}</b>
                      <span className="text-[10px]">{signed[slot] ? clock(signed[slot]) : slot === currentSlot ? 'Due Now' : 'Upcoming'}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* PRIMARY ACTIONS: CARDLESS CHECK-IN / CHECK-OUT / PATROL */}
            <section className="mt-4 grid gap-2.5">
              {!checkedIn && !checkedOut && (
                <div>
                  <button
                    className={`${big} bg-[#16794A] text-white hover:bg-emerald-700`}
                    disabled={busy || scanning !== null}
                    onClick={() => void submit('attendance', '')}
                  >
                    <Navigation className="size-5" />
                    Verify Location &amp; Check In for Shift
                  </button>
                  <p className="mt-1.5 text-center text-xs text-[#6B6B72]">
                    Uses your phone&apos;s GPS to verify you are physically at your site. Independent of NFC tags.
                  </p>
                  {windowOpen && currentSlot && (
                    <button
                      className={`${big} mt-2.5 border-2 border-emerald-700 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 shadow-sm`}
                      disabled={busy || scanning !== null}
                      onClick={() => void submit('patrol', '')}
                    >
                      <CheckCircle2 className="size-5 text-emerald-700" />
                      Verify Location &amp; Sign {currentSlot} Hourly Patrol
                    </button>
                  )}
                  <p className="hidden">
                  </p>
                </div>
              )}

              {checkedOut && (
                <div>
                  <button
                    className={`${big} bg-[#16794A] text-white hover:bg-emerald-700`}
                    disabled={busy || scanning !== null}
                    onClick={() => void submit('attendance', '')}
                  >
                    <Navigation className="size-5" />
                    Check in again
                  </button>
                  <p className="mt-1.5 text-center text-xs text-[#6B6B72]">
                    You checked out at {clock(today?.checkedOutAt)}. Tap to start another shift check-in.
                  </p>
                </div>
              )}

              {checkedIn && (
                <>
                  {/* HOURLY PATROL (STAY-AWAKE) PRIMARY ACTION */}
                  {windowOpen && currentSlot && (
                    <div className="grid gap-1.5">
                      {!isCurrentSlotSigned ? (
                        <button
                          className={`${big} bg-[#16794A] text-white hover:bg-emerald-700 shadow-md`}
                          disabled={busy || scanning !== null}
                          onClick={() => void submit('patrol', '')}
                        >
                          <CheckCircle2 className="size-5" />
                          Verify Location &amp; Sign {currentSlot} Hourly Patrol
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3.5 text-center text-sm font-semibold text-emerald-900 shadow-sm">
                          <CheckCircle2 className="size-5 text-emerald-700 shrink-0" />
                          <span>{currentSlot} Hourly Patrol Signed (Awake Verified)</span>
                        </div>
                      )}
                      <p className="text-center text-xs text-[#6B6B72]">
                        {!isCurrentSlotSigned
                          ? `Hourly vigilance check for ${currentSlot}. Must be physically at ${assignedSite?.name ?? 'your post'} to sign.`
                          : `Next stay-awake check will open at ${String((hour + 1) % 24).padStart(2, '0')}:00.`}
                      </p>
                    </div>
                  )}

                  {!windowOpen && shift && (
                    <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center text-xs text-zinc-600">
                      Hourly patrol check-ins open during active shift hours ({hourLabel(shift.startHour)} – {hourLabel(shift.endHour)}).
                    </p>
                  )}


                  {/* CHECK OUT ACTION */}
                  <button
                    className={`${big} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`}
                    disabled={busy || scanning !== null}
                    onClick={() => void submit('attendance', '')}
                  >
                    <LogOut className="size-5 text-zinc-500" />
                    Check out of Shift
                  </button>
                </>
              )}
            </section>

            {/* STATUS / STAGE / RECEIPT / ERROR FEEDBACK */}
            {scanning && (
              <button onClick={stop} className={`${big} mt-3 border border-zinc-300 bg-white`}>
                <X className="size-4" /> Cancel Scan
              </button>
            )}

            {stage && (
              <p
                role="status"
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-900"
              >
                <RefreshCw className="size-4 animate-spin" />
                {stage}
              </p>
            )}

            {busy && !stage && <p className="mt-3 text-center text-xs text-[#6B6B72]">Connecting to server…</p>}

            {message && !busy && (
              <div
                role="status"
                className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#16794A]/30 bg-[#E3F4EA] p-3.5 text-sm text-[#16794A]"
              >
                <CheckCircle2 className="size-5 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {receipt && !busy && (
              <div role="status" className="mt-2 rounded-xl border border-[#E4E4E7] bg-white p-3.5 text-xs shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6B72]">
                  {receipt.action === 'attendance'
                    ? 'Shift Attendance Verified'
                    : receipt.action === 'patrol'
                      ? 'Patrol Checkpoint Recorded'
                      : 'Emergency SOS Transmitted'}
                </p>
                <dl className="mt-2 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-[#6B6B72]">Guard</dt>
                  <dd className="font-semibold">{receipt.guardName}</dd>
                  <dt className="text-[#6B6B72]">Site</dt>
                  <dd>{receipt.siteName ?? 'No site assigned'}</dd>
                  <dt className="text-[#6B6B72]">Timestamp</dt>
                  <dd className="font-mono">{receipt.at}</dd>
                  {receipt.checkpoint && (
                    <>
                      <dt className="text-[#6B6B72]">Checkpoint</dt>
                      <dd className="font-mono font-semibold">{receipt.checkpoint}</dd>
                    </>
                  )}
                  <dt className="text-[#6B6B72]">Location</dt>
                  <dd
                    className={
                      receipt.withinBounds === false ? 'font-semibold text-[#B42318]' : 'font-medium text-[#16794A]'
                    }
                  >
                    {receipt.withinBounds === false
                      ? 'Outside Geofence Perimeter (Supervisor Alerted)'
                      : 'Verified Inside Site Geofence'}
                  </dd>
                </dl>
              </div>
            )}

            {/* ERROR / REJECTION BANNER */}
            {error && (
              <div
                ref={alertRef}
                role="alert"
                className="mt-3 rounded-2xl border border-red-200 bg-[#FDECEA] p-4 text-sm text-[#B42318] shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-5 shrink-0 text-[#B42318]" />
                  <div className="flex-1">
                    <p className="font-semibold">Action Rejected</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-red-900">{error}</p>
                  </div>
                </div>
                {lastCode && (
                  <p className="mt-2 border-t border-red-200 pt-2 font-mono text-[10px] text-red-800">
                    Tag: {lastCode}
                  </p>
                )}
              </div>
            )}

            {/* OPTIONAL NFC & MANUAL FALLBACK ACCORDION */}
            <div className="mt-6 border-t border-[#E4E4E7] pt-4">
              <div className="flex items-center justify-between text-xs text-[#52525B]">
                <button
                  type="button"
                  onClick={() => void scan('attendance')}
                  className="flex items-center gap-1.5 font-semibold hover:underline"
                >
                  <Radio className="size-3.5 text-zinc-600" />
                  {nfc ? 'Scan NFC Tag' : 'NFC Tag'}
                </button>
                <button
                  type="button"
                  onClick={() => setManual((m) => !m)}
                  className="flex items-center gap-1.5 font-semibold hover:underline"
                >
                  <KeyRound className="size-3.5 text-zinc-600" />
                  Type Tag Code
                </button>
              </div>

              {manual && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (token.trim()) void submit(manualAction, token.trim())
                  }}
                  className="mt-3 grid gap-2.5 rounded-2xl border border-[#E4E4E7] bg-white p-4 shadow-sm"
                >
                  <label className="text-xs font-semibold">
                    Action
                    <select
                      value={manualAction}
                      onChange={(e) => setManualAction(e.target.value as Action)}
                      className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                    >
                      <option value="attendance">Check in or out</option>
                      <option value="patrol">Patrol checkpoint</option>
                      <option value="sos">Emergency SOS</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold">
                    Tag code
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="e.g. 9f2b7c41-3a5e-4d18-9c6b-2f7e8a1d4b90"
                      className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 font-mono text-sm"
                    />
                  </label>
                  <button
                    disabled={busy || !token.trim()}
                    className={`${big} min-h-[46px] bg-[#1E1F22] text-white hover:bg-zinc-800`}
                  >
                    Submit Code
                  </button>
                </form>
              )}

              <div className="mt-3">
                <NfcDiagnostics />
              </div>
            </div>

            {/* EMERGENCY SOS BUTTON */}
            <div className="mt-6 border-t border-[#E4E4E7] pt-4">
              <button
                onClick={() => {
                  if (window.confirm('Send an emergency SOS alert with your live coordinates to supervisors now?')) {
                    void submit('sos', '')
                  }
                }}
                disabled={busy || scanning !== null}
                className={`${big} bg-[#B42318] text-white hover:bg-red-700`}
              >
                <ShieldAlert className="size-5" />
                Emergency SOS
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-[#6B6B72]">
                Press only in emergencies. Instantly alerts supervisors with your live GPS location.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
