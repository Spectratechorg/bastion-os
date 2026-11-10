'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Badge, ErrorBanner, btn, smallBtn } from '@/components/ui-bits'
import { WidgetBoundary } from '@/components/widget-boundary'
import { api, when } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse bg-[#EFEFF1] sm:h-80" />,
})

type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

type AdminData = {
  organization: {
    name: string
    guardAppCode: string
  }
  readiness: {
    totalGuards: number
    activeGuards: number
    onDutyCount: number
    lateOrNoShowCount: number
    suspendedCount: number
    attendanceRate: number
  }
  coverage: {
    totalSites: number
    activeSitesCount: number
    staffedSitesCount: number
    vacantSitesCount: number
    shiftCoverageRatio: number
    matrix: Array<{
      id: string
      name: string
      address: string
      dangerLevel: string
      status: string
      geofenceRadius: number
      assignedCount: number
      presentCount: number
      coverageStatus: 'optimal' | 'understaffed' | 'vacant'
    }>
  }
  sla: {
    completedPatrols: number
    expectedPatrols: number
    patrolSlaPercent: number
  }
  exceptions: Array<{
    id: string
    type: string
    title: string
    body: string
    severity: string
    time: string
  }>
  auditLogs: Array<{
    id: string
    type: string
    title: string
    body: string
    createdAt: string
  }>
}

export function OverviewPage() {
  const [d, setD] = useState<{
    guards: Row[]
    sites: Row[]
    attendance: Row[]
    incidents: Row[]
    alerts: Row[]
    activity: Row[]
    patrols: { summary: Record<string, number> }
  } | null>(null)
  const [admin, setAdmin] = useState<AdminData | null>(null)
  const [error, setError] = useState('')
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(true)

  // Supervisor Actions State
  const [rotating, setRotating] = useState(false)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [actionSuccess, setActionSuccess] = useState('')

  // Tactical Napoleon AI State
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    const get = (s: string) => api<Row[]>(`/api/operations?section=${s}`)
    const results = await Promise.allSettled([
      get('guards'),
      get('sites'),
      get('attendance'),
      get('incidents'),
      get('alerts'),
      get('activity'),
      api<{ summary: Record<string, number> }>('/api/patrols'),
      api<AdminData>('/api/admin'),
    ])

    const labels = ['guards', 'sites', 'attendance', 'incidents', 'alerts', 'activity', 'patrols', 'admin']
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [labels[i]] : []))
    const pick = <T,>(idx: number, fallback: T): T =>
      results[idx].status === 'fulfilled' ? (results[idx] as PromiseFulfilledResult<T>).value : fallback

    setD({
      guards: pick<Row[]>(0, []),
      sites: pick<Row[]>(1, []),
      attendance: pick<Row[]>(2, []),
      incidents: pick<Row[]>(3, []),
      alerts: pick<Row[]>(4, []),
      activity: pick<Row[]>(5, []),
      patrols: pick<{ summary: Record<string, number> }>(6, { summary: {} }),
    })

    const adminResult = pick<AdminData | null>(7, null)
    if (adminResult) setAdmin(adminResult)

    setError(
      failed.length ? `Some operational feeds could not load (${failed.join(', ')}). The rest of the dashboard remains active.` : '',
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
    const t = window.setInterval(() => {
      if (!document.hidden) void loadAll()
    }, 45000)
    return () => window.clearInterval(t)
  }, [loadAll])

  async function handleAcknowledgeAlert(id: string) {
    try {
      await api('/api/admin', {
        method: 'POST',
        json: { action: 'acknowledge-alert', id },
      })
      if (admin) {
        setAdmin({
          ...admin,
          exceptions: admin.exceptions.filter((ex) => ex.id !== id),
        })
      }
      if (d) {
        setD({
          ...d,
          alerts: d.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to acknowledge alert.')
    }
  }

  async function handleRotateCode() {
    if (!confirm('Rotate the Guard App Access Code? Lost or unverified devices will immediately lose access.')) {
      return
    }
    setRotating(true)
    try {
      const res = await api<{ ok: boolean; code: string }>('/api/admin', {
        method: 'POST',
        json: { action: 'rotate-code' },
      })
      if (res.code && admin) {
        setAdmin({
          ...admin,
          organization: { ...admin.organization, guardAppCode: res.code },
        })
        setActionSuccess(`Guard App code rotated to ${res.code}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rotate guard app code.')
    } finally {
      setRotating(false)
    }
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return
    setBroadcasting(true)
    try {
      await api('/api/admin', {
        method: 'POST',
        json: {
          action: 'broadcast-alert',
          title: broadcastTitle,
          message: broadcastMessage,
        },
      })
      setBroadcastTitle('')
      setBroadcastMessage('')
      setActionSuccess('Tactical alert dispatched to all field units.')
      void loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch broadcast.')
    } finally {
      setBroadcasting(false)
    }
  }

  async function handleAskNapoleon(promptText: string) {
    const q = promptText.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAiError('')
    setAiAnswer('')
    try {
      const res = await fetch('/api/napoleon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
      })
      let payload: { choices?: Array<{ message?: { content?: string } }>; error?: string } = {}
      try {
        payload = await res.json()
      } catch {
        payload = { error: `Server returned HTTP ${res.status}` }
      }
      if (!res.ok) throw new Error(payload.error ?? `Napoleon request failed (${res.status})`)
      const answer = payload.choices?.[0]?.message?.content
      if (!answer) throw new Error('Napoleon returned an empty response.')
      setAiAnswer(answer)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not query Napoleon AI.')
    } finally {
      setAiLoading(false)
    }
  }

  const statusDot = (label: string, dot: string, text: string) => (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[10.5px] font-medium ${text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />{label}
    </span>
  )

  const dangerBadge = (level: string) => {
    if (level === 'high') return statusDot('High risk', 'bg-[#B42318]', 'text-[#8C2B1E]')
    if (level === 'medium') return statusDot('Medium', 'bg-[#B7791F]', 'text-[#8A5A12]')
    return statusDot('Low', 'bg-[#16794A]', 'text-[#16794A]')
  }

  const coverageBadge = (status: 'optimal' | 'understaffed' | 'vacant') => {
    if (status === 'optimal') return statusDot('Staffed', 'bg-[#16794A]', 'text-[#16794A]')
    if (status === 'understaffed') return statusDot('Understaffed', 'bg-[#B7791F]', 'text-[#8A5A12]')
    return statusDot('Vacant', 'bg-[#B42318]', 'text-[#8C2B1E]')
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const checkedToday = d
    ? new Set(
        d.attendance
          .filter((a) => new Date(a.checkedInAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today)
          .map((a) => a.guardId),
      )
    : new Set<string>()
  const activeGuards = d?.guards.filter((g) => g.status === 'active') ?? []
  const rate = activeGuards.length ? Math.round((checkedToday.size / activeGuards.length) * 100) : 0
  const openAlerts = d?.alerts.filter((a) => !a.acknowledged) ?? []
  const openIncidents = d?.incidents.filter((i) => i.status !== 'resolved') ?? []
  const bySite = (d?.sites ?? [])
    .filter((x) => x.status !== 'inactive')
    .map((x) => {
      const crew = activeGuards.filter((g) => g.site === x.name)
      return {
        name: x.name as string,
        total: crew.length,
        present: crew.filter((g) => checkedToday.has(g.id)).length,
      }
    })
    .filter((x) => x.total > 0)

  return (
    <>
      <PageHeader
        title="Operations Overview"
        subtitle="Live activity, coverage and alerts across all sites."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => void loadAll()} className={smallBtn}>
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} retry={() => void loadAll()} />

      {actionSuccess && (
        <div className="mb-4 flex items-center justify-between rounded-[8px] border border-[#E4E4E7] bg-white px-4 py-2 text-xs text-[#16794A]">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="text-[10.5px] text-[#6B6B72] hover:text-[#18181B]">Dismiss</button>
        </div>
      )}

      <section className="mb-5 flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-[#E4E4E7] pb-4">
        <div>
          <p className="ws-num text-[22px] font-semibold leading-none text-[#18181B]">{admin ? `${admin.coverage.shiftCoverageRatio}%` : `${rate}%`}</p>
          <p className="mt-1.5 text-[11px] text-[#6B6B72]">Shift coverage</p>
          <p className="mt-0.5 text-[10px] text-[#9A9AA1]">{admin ? `${admin.coverage.staffedSitesCount}/${admin.coverage.activeSitesCount} sites staffed` : 'No site data'}</p>
        </div>
        <div>
          <p className="ws-num text-[22px] font-semibold leading-none text-[#18181B]">{checkedToday.size}/{activeGuards.length || '—'}</p>
          <p className="mt-1.5 text-[11px] text-[#6B6B72]">Guards on duty</p>
          <p className="mt-0.5 text-[10px] text-[#9A9AA1]">{rate}% of the fleet</p>
        </div>
        <div>
          <p className="ws-num text-[22px] font-semibold leading-none text-[#18181B]">{admin ? `${admin.sla.patrolSlaPercent}%` : `${d?.patrols.summary.completedToday ?? 0}`}</p>
          <p className="mt-1.5 text-[11px] text-[#6B6B72]">Patrol SLA</p>
          <p className="mt-0.5 text-[10px] text-[#9A9AA1]">{admin ? `${admin.sla.completedPatrols}/${admin.sla.expectedPatrols} scans` : 'Completed today'}</p>
        </div>
        <div>
          <p className={`ws-num text-[22px] font-semibold leading-none ${(admin?.exceptions.length ?? openAlerts.length) > 0 ? 'text-[#B42318]' : 'text-[#18181B]'}`}>{admin ? admin.exceptions.length : openAlerts.length}</p>
          <p className="mt-1.5 text-[11px] text-[#6B6B72]">Critical exceptions</p>
          <p className="mt-0.5 text-[10px] text-[#9A9AA1]">{(admin?.exceptions.length ?? openAlerts.length) === 0 ? 'All clear' : 'Requires action'}</p>
        </div>
      </section>

      {/* 2. PRIMARY OPERATIONS GRID */}
      <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* LEFT COLUMN: LIVE MAP & SITE COVERAGE MATRIX */}
        <div className="space-y-4 min-w-0">
          {/* Live Map */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-[#E4E4E7] bg-white">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Live map</h2>
                <p className="mt-0.5 text-xs text-[#6B6B72]">
                  {d ? `${d.sites.length} site${d.sites.length === 1 ? '' : 's'} · guards update live as coordinates sync` : 'Loading…'}
                </p>
              </div>
              {d && d.sites.length > 0 && (
                <select
                  aria-label="Zoom to site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#E4E4E7] bg-white px-2 text-xs sm:w-auto"
                >
                  <option value="">All sites</option>
                  {d.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {d && d.sites.length > 0 ? (
              <WidgetBoundary title="Live map">
                <div className="min-h-[18rem] flex-1">
                  <LiveMap
                    sites={d.sites as never}
                    guards={d.guards as never}
                    selectedSiteId={siteId || undefined}
                    height="h-72 sm:h-84 xl:h-96"
                  />
                </div>
              </WidgetBoundary>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 border-t border-[#E4E4E7] text-xs text-[#6B6B72]">
                No sites registered yet.
                <Link href="/sites" className={smallBtn}>
                  Add a site
                </Link>
              </div>
            )}
          </section>

          {/* Site Coverage & Risk Matrix Table */}
          <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Site coverage</h2>
                <p className="text-xs text-[#6B6B72]">Real-time site post requirements vs. on-duty guards present.</p>
              </div>
              <Link href="/sites" className={smallBtn}>
                Manage sites
              </Link>
            </div>

            <div className="mt-3.5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E4E4E7] text-[11px] font-semibold text-[#6B6B72]">
                    <th className="pb-2.5">Site Name</th>
                    <th className="pb-2.5">Risk Level</th>
                    <th className="pb-2.5">Geofence</th>
                    <th className="pb-2.5">Guards Present</th>
                    <th className="pb-2.5">Coverage State</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5]">
                  {!admin || admin.coverage.matrix.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-[#6B6B72]">
                        No active sites registered. Go to Sites to create your first security perimeter.
                      </td>
                    </tr>
                  ) : (
                    admin.coverage.matrix.map((site) => (
                      <tr key={site.id} className="hover:bg-[#FAFAFA]">
                        <td className="py-2.5 font-medium text-[#18181B]">{site.name}</td>
                        <td className="py-2.5">{dangerBadge(site.dangerLevel)}</td>
                        <td className="py-2.5 text-[#6B6B72]">{site.geofenceRadius}m radius</td>
                        <td className="py-2.5">
                          <span className="font-semibold text-[#18181B]">{site.presentCount}</span>
                          <span className="text-[#6B6B72]"> / {site.assignedCount} assigned</span>
                        </td>
                        <td className="py-2.5">{coverageBadge(site.coverageStatus)}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => setSiteId(site.id)}
                            className="rounded-md border border-[#E4E4E7] px-2 py-0.5 text-[10.5px] font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                          >
                            View on map
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Attendance by Site Today & Latest Activity Stream */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Attendance by Site Today</h2>
                <Link href="/attendance" className="text-xs font-semibold text-zinc-900 underline">
                  Attendance
                </Link>
              </div>
              <ul className="mt-3 grid gap-3">
                {bySite.map((x) => (
                  <li key={x.name} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{x.name}</span>
                      <b className="font-mono tabular-nums">
                        {x.present}/{x.total}
                      </b>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#EFEFF1]">
                      <div
                        className="h-1.5 rounded-full bg-[#2A2B2E]"
                        style={{ width: `${x.total ? (x.present / x.total) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
                {d && bySite.length === 0 && <li className="text-xs text-[#6B6B72]">Assign guards to sites to see coverage.</li>}
              </ul>
            </section>

            <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Latest activity</h2>
                <Link href="/reports" className="text-xs font-semibold text-zinc-900 underline">
                  Reports
                </Link>
              </div>
              <ul className="mt-2 divide-y divide-[#EFEFF1]">
                {d?.activity.slice(0, 5).map((a) => (
                  <li key={a.id} className="py-2 text-xs">
                    <b className="block truncate text-[12px] font-semibold text-zinc-900">{a.title}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-[#6B6B72]">
                      {a.body} · {when(a.createdAt)}
                    </span>
                  </li>
                ))}
                {d && d.activity.length === 0 && <li className="py-6 text-center text-xs text-[#6B6B72]">Nothing logged yet today.</li>}
                {!d && <li className="py-6 text-center text-xs text-[#6B6B72]">Loading stream…</li>}
              </ul>
            </section>
          </div>
        </div>

        {/* RIGHT COLUMN: SUPERVISOR CONTROLS, EXCEPTIONS & DISPATCH */}
        <div className="space-y-4 min-w-0">
          {/* Supervisor Rapid Actions Panel */}
          <div className="space-y-3.5">
            {/* Action 1: Guard App Security Access Code */}
            <div className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-[#18181B]" />
                  <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Guard app code</h3>
                </div>
                <Badge value="Security" />
              </div>
              <p className="mt-1 text-xs text-[#6B6B72]">
                Shared code for phone scan access. Replace it if a device is lost.
              </p>
              <div className="mt-3 flex items-center justify-between rounded-[8px] bg-[#F4F4F5] p-2.5">
                <span className="font-mono text-sm font-bold tracking-wider text-[#18181B]">
                  {admin?.organization.guardAppCode ?? 'GRD-....-....'}
                </span>
                <button
                  onClick={handleRotateCode}
                  disabled={rotating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
                >
                  <RefreshCw className={`size-3 ${rotating ? 'animate-spin' : ''}`} />
                  Rotate
                </button>
              </div>
            </div>

            {/* Action 2: Broadcast */}
            <div className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-[#6B6B72]" />
                <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Broadcast</h3>
              </div>
              <form onSubmit={handleBroadcast} className="mt-2.5 space-y-2">
                <input
                  type="text"
                  placeholder="Alert headline"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="w-full rounded-[8px] border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:border-[#18181B] focus:outline-hidden"
                />
                <textarea
                  rows={2}
                  placeholder="Operational directive to supervisors..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="w-full resize-none rounded-[8px] border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:border-[#18181B] focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={broadcasting || !broadcastTitle.trim()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-[#2A2B2E] py-1.5 text-xs font-semibold text-white hover:bg-[#3F4045] disabled:opacity-50"
                >
                  <Send className="size-3" />
                  {broadcasting ? 'Dispatching…' : 'Send broadcast'}
                </button>
              </form>
            </div>

            {/* Action 3: Napoleon Widget */}
            <div className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#18181B]" />
                  <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Napoleon</h3>
                </div>
                <Link href="/napoleon" className="text-[11px] font-semibold text-[#18181B] hover:underline">
                  Open →
                </Link>
              </div>
              <p className="mt-1 text-xs text-[#6B6B72]">Ask about guards, sites and coverage.</p>

              <div className="mt-2.5 flex flex-wrap gap-1">
                {[
                  'Which guards need attention?',
                  "Where are today's coverage gaps?",
                  'Which sites have highest risk?',
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setAiPrompt(s)
                      void handleAskNapoleon(s)
                    }}
                    disabled={aiLoading}
                    className="rounded-[6px] px-2 py-1 text-[10.5px] font-medium text-[#3F3F46] hover:bg-[#F0F0F1] disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleAskNapoleon(aiPrompt)
                }}
                className="mt-2.5 flex gap-1.5"
              >
                <input
                  type="text"
                  placeholder="Ask Napoleon about security operations…"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full rounded-[8px] border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:border-[#18181B] focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="inline-flex shrink-0 items-center justify-center rounded-[8px] bg-[#2A2B2E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F4045] disabled:opacity-50"
                >
                  {aiLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </button>
              </form>

              {aiLoading && (
                <p className="mt-2 text-[11px] text-[#6B6B72] animate-pulse">
                  Napoleon is analyzing operational records…
                </p>
              )}

              {aiError && (
                <div className="mt-2 rounded-[8px] border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  {aiError}
                </div>
              )}

              {aiAnswer && (
                <div className="mt-2.5 max-h-48 overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-2.5 text-xs leading-relaxed text-[#18181B] whitespace-pre-wrap">
                  {aiAnswer}
                </div>
              )}
            </div>
          </div>

          {/* Critical Exception Feed */}
          <section className="flex flex-col rounded-[12px] border border-[#E4E4E7] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="size-4 text-[#DC2626]" />
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">
                  Critical exceptions
                </h2>
              </div>
              <span className="text-xs text-[#6B6B72]">{admin?.exceptions.length ?? openAlerts.length} active</span>
            </div>

            <div className="mt-3 space-y-2">
              {!admin || admin.exceptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="size-6 text-[#16A34A]" />
                  <p className="mt-1 text-xs font-medium text-[#18181B]">Zero Critical Exceptions</p>
                  <p className="text-[11px] text-[#6B6B72]">All patrols, check-ins, and geofences are compliant.</p>
                </div>
              ) : (
                admin.exceptions.slice(0, 6).map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-start justify-between rounded-[8px] border border-[#FEE2E2] bg-[#FEF2F2]/50 p-2.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          {ex.type}
                        </span>
                        <h3 className="font-semibold text-[#18181B]">{ex.title}</h3>
                      </div>
                      <p className="text-[11px] text-[#52525B]">{ex.body}</p>
                      <span className="text-[9.5px] text-[#A1A1AA]">
                        {new Date(ex.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {!ex.id.startsWith('breach-') && (
                      <button
                        onClick={() => handleAcknowledgeAlert(ex.id)}
                        className="ml-2 shrink-0 rounded-lg border border-[#E4E4E7] bg-white px-2 py-0.5 text-[10.5px] font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Open Incidents Severity Strip */}
          <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Open Incidents by Severity</h2>
              <Link href="/incidents" className="text-xs font-semibold text-zinc-900 underline">
                Incidents
              </Link>
            </div>
            <dl className="mt-2.5 grid grid-cols-4 gap-px overflow-hidden rounded-[10px] bg-[#EFEFF1] text-center">
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const n = openIncidents.filter((i) => i.severity === sev).length
                return (
                  <div key={sev} className="bg-white px-2 py-2">
                    <dd className="font-mono text-base font-semibold tabular-nums text-zinc-900">{n}</dd>
                    <dt className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6B6B72]">{sev}</dt>
                  </div>
                )
              })}
            </dl>
          </section>

          {/* Supervisor Security Audit Trail */}
          <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-[#18181B]" />
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Security Audit Trail</h2>
              </div>
              <Link href="/reports" className="text-[11px] text-[#6B6B72] hover:underline">
                Full Log →
              </Link>
            </div>
            <div className="mt-2.5 divide-y divide-[#F4F4F5]">
              {!admin || admin.auditLogs.length === 0 ? (
                <p className="py-3 text-center text-xs text-[#6B6B72]">No security events logged today.</p>
              ) : (
                admin.auditLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="truncate pr-2">
                      <span className="font-medium text-[#18181B]">{log.title}</span>
                      <span className="ml-1.5 text-[11px] text-[#6B6B72] truncate">{log.body}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-[#A1A1AA]">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
