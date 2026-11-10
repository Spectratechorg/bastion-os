'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Activity,
  AlertOctagon,
  Clock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Badge, ErrorBanner, btn, smallBtn } from '@/components/ui-bits'
import { WidgetBoundary } from '@/components/widget-boundary'
import { api, clearClientCache, when } from '@/lib/client'

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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const checkedToday = d
    ? new Set(
        d.attendance
          .filter((a) => new Date(a.checkedInAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today)
          .map((a) => a.guardId),
      )
    : new Set<string>()
  const activeGuards = d?.guards.filter((g) => g.status === 'active') ?? []
  const activeSites = admin?.coverage.activeSitesCount ?? d?.sites.filter((site) => site.status !== 'inactive').length ?? 0
  const totalGuards = d?.guards.length ?? 0
  const suspendedGuards = d?.guards.filter((guard) => guard.status === 'suspended').length ?? 0
  const totalSites = d?.sites.length ?? 0
  const rate = activeGuards.length ? Math.round((checkedToday.size / activeGuards.length) * 100) : 0
  const attendanceToday = d?.attendance.filter((row) => new Date(row.checkedInAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today).length ?? 0
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
            <button onClick={() => { clearClientCache(); void loadAll() }} className={smallBtn}>
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} retry={() => void loadAll()} />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-[#6B6B72]">Active guards</p><Users className="size-4 shrink-0 text-[#9A9AA1]" strokeWidth={1.75} /></div>
          <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#18181B]">{activeGuards.length}</p>
          <p className="mt-1.5 text-[10.5px] text-[#8A938B]">{totalGuards} registered</p>
          <div className="mt-3 flex items-center gap-2 text-[10.5px] text-[#6B6B72]"><span className={`size-1.5 rounded-full ${suspendedGuards > 0 ? 'bg-[#B7791F]' : 'bg-[#16794A]'}`} />{suspendedGuards > 0 ? `${suspendedGuards} suspended` : 'All active'}</div>
        </article>

        <article className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-[#6B6B72]">Attendance today</p><Activity className="size-4 shrink-0 text-[#9A9AA1]" strokeWidth={1.75} /></div>
          <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#18181B]">{attendanceToday}</p>
          <p className="mt-1.5 text-[10.5px] text-[#8A938B]">{checkedToday.size}/{activeGuards.length || '—'} guards · {rate}%</p>
          <div className="mt-3 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#2A2B2E] transition-[width] duration-500" style={{ width: `${Math.min(100, rate)}%` }} /></div>
        </article>

        <article className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-[#6B6B72]">Patrol SLA</p><Clock className="size-4 shrink-0 text-[#9A9AA1]" strokeWidth={1.75} /></div>
          <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#18181B]">{admin ? `${admin.sla.patrolSlaPercent}%` : `${d?.patrols.summary.completedToday ?? 0}`}</p>
          <p className="mt-1.5 text-[10.5px] text-[#8A938B]">{admin ? `${admin.sla.completedPatrols}/${admin.sla.expectedPatrols} scans today` : 'Completed today'}</p>
          <div className="mt-3 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#2A2B2E] transition-[width] duration-500" style={{ width: `${Math.min(100, admin?.sla.patrolSlaPercent ?? 50)}%` }} /></div>
        </article>

        <article className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-[#6B6B72]">Total sites</p><MapPin className="size-4 shrink-0 text-[#9A9AA1]" strokeWidth={1.75} /></div>
          <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#18181B]">{totalSites}</p>
          <p className="mt-1.5 text-[10.5px] text-[#8A938B]">{activeSites} active</p>
          <div className="mt-3 flex items-center gap-2 text-[10.5px] text-[#6B6B72]"><span className={`size-1.5 rounded-full ${totalSites === 0 ? 'bg-[#9A9AA1]' : 'bg-[#16794A]'}`} />{totalSites === 0 ? 'No sites registered' : `${totalSites} site${totalSites === 1 ? '' : 's'} registered`}</div>
        </article>
      </section>

      {/* 2. PRIMARY OPERATIONS GRID */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
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
                    height="h-56 sm:h-64"
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

          {/* Attendance by Site Today & Latest Activity Stream */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Attendance by Site Today</h2>
                <Link href="/attendance" className="text-xs font-semibold text-[#18181B] underline">
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
                <Link href="/reports" className="text-xs font-semibold text-[#18181B] underline">
                  Reports
                </Link>
              </div>
              <ul className="mt-2 divide-y divide-[#EFEFF1]">
                {d?.activity.slice(0, 5).map((a) => (
                  <li key={a.id} className="py-2 text-xs">
                    <b className="block truncate text-[12px] font-semibold text-[#18181B]">{a.title}</b>
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
          {/* Open Incidents Severity Strip */}
          <section className="rounded-[12px] border border-[#E4E4E7] bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Open Incidents by Severity</h2>
              <Link href="/incidents" className="text-xs font-semibold text-[#18181B] underline">
                Incidents
              </Link>
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] bg-[#EFEFF1] text-center">
              {(['high', 'medium', 'low'] as const).map((sev) => {
                const n = openIncidents.filter((i) => i.severity === sev).length
                return (
                  <div key={sev} className="bg-white px-2 py-2">
                    <dd className="font-mono text-base font-semibold tabular-nums text-[#18181B]">{n}</dd>
                    <dt className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6B6B72]">{sev}</dt>
                  </div>
                )
              })}
            </dl>
          </section>

        </div>
      </div>
    </>
  )
}
