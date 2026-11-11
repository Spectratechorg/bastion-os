'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Badge, ErrorBanner, LoadingBlock, Skeleton, btn, smallBtn } from '@/components/ui-bits'
import { WidgetBoundary } from '@/components/widget-boundary'
import { api, clearClientCache, when } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse bg-[#EFEFF1] sm:h-[300px]" />,
})

const card = 'rounded-[14px] border border-[#E7E5DF] bg-white shadow-[0_1px_2px_rgba(16,24,20,0.04),0_12px_32px_-24px_rgba(16,24,20,0.28)]'

function activityIcon(type: string) {
  if (type.startsWith('guard')) return Users
  if (type.startsWith('site')) return MapPin
  if (type.startsWith('incident')) return ShieldAlert
  if (type.startsWith('client')) return BriefcaseBusiness
  return Activity
}

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
  const [lastUpdated, setLastUpdated] = useState('')

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
    ])

    const labels = ['guards', 'sites', 'attendance', 'incidents', 'alerts', 'activity', 'patrols']
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
    setError(failed.length ? `Some operational feeds could not load (${failed.join(', ')}). The rest of the dashboard remains active.` : '')
    setLoading(false)
    setLastUpdated(new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }))

    // The command-centre aggregate is slower and must not hold the whole dashboard back.
    api<AdminData>('/api/admin').then(setAdmin).catch(() => undefined)
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
  const dayLabel = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })
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
        subtitle={`${dayLabel} · Live activity, coverage and alerts across all sites.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden h-9 items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-3 text-[10.5px] text-[#52525B] sm:inline-flex">
              <span className="size-1.5 rounded-full bg-[#16794A]" />
              Live{lastUpdated ? ` · updated ${lastUpdated}` : ''}
            </span>
            <button onClick={() => { clearClientCache(); void loadAll() }} className={btn}>
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} retry={() => void loadAll()} />

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <article className={`${card} p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,20,0.05),0_18px_36px_-24px_rgba(16,24,20,0.32)]`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#6B6B72]">Active guards</p>
              <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#18181B]">{d ? activeGuards.length : <Skeleton className="h-7 w-12" />}</p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F3EE] text-[#526552]"><Users className="size-4" strokeWidth={1.75} /></span>
          </div>
          <p className="mt-1 text-[10.5px] text-[#8A938B]">{d ? `${totalGuards} registered` : <Skeleton className="h-3 w-20" />}</p>
          <div className="mt-3 flex items-center gap-2 text-[10.5px] text-[#6B6B72]"><span className={`size-1.5 rounded-full ${suspendedGuards > 0 ? 'bg-[#B7791F]' : 'bg-[#16794A]'}`} />{suspendedGuards > 0 ? `${suspendedGuards} suspended` : 'All active'}</div>
        </article>

        <article className={`${card} p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,20,0.05),0_18px_36px_-24px_rgba(16,24,20,0.32)]`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#6B6B72]">Attendance today</p>
              <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#18181B]">{d ? attendanceToday : <Skeleton className="h-7 w-10" />}</p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F3EE] text-[#526552]"><Activity className="size-4" strokeWidth={1.75} /></span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10.5px] text-[#6B6B72]"><span>{d ? `${checkedToday.size}/${activeGuards.length || '—'} guards` : <Skeleton className="h-3 w-20" />}</span><span className="font-semibold text-[#52525B]">{d ? `${rate}%` : ''}</span></div>
          <div className="mt-1.5 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#16794A] transition-[width] duration-500" style={{ width: `${Math.min(100, rate)}%` }} /></div>
        </article>

        <article className={`${card} p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,20,0.05),0_18px_36px_-24px_rgba(16,24,20,0.32)]`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#6B6B72]">Patrol SLA</p>
              <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#18181B]">{admin || d ? (admin ? `${admin.sla.patrolSlaPercent}%` : `${d?.patrols.summary.completedToday ?? 0}`) : <Skeleton className="h-7 w-16" />}</p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F3EE] text-[#526552]"><Clock className="size-4" strokeWidth={1.75} /></span>
          </div>
          <p className="mt-1 text-[10.5px] text-[#8A938B]">{admin ? `${admin.sla.completedPatrols}/${admin.sla.expectedPatrols} checkpoints signed today` : d ? 'Completed today' : <Skeleton className="h-3 w-24" />}</p>
          <div className="mt-3 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#16794A] transition-[width] duration-500" style={{ width: `${Math.min(100, admin?.sla.patrolSlaPercent ?? 50)}%` }} /></div>
        </article>

        <article className={`${card} p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,20,0.05),0_18px_36px_-24px_rgba(16,24,20,0.32)]`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#6B6B72]">Total sites</p>
              <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#18181B]">{d ? totalSites : <Skeleton className="h-7 w-10" />}</p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F3EE] text-[#526552]"><MapPin className="size-4" strokeWidth={1.75} /></span>
          </div>
          <p className="mt-1 text-[10.5px] text-[#8A938B]">{d ? `${activeSites} active` : <Skeleton className="h-3 w-14" />}</p>
          <div className="mt-3 flex items-center gap-2 text-[10.5px] text-[#6B6B72]"><span className={`size-1.5 rounded-full ${totalSites === 0 ? 'bg-[#9A9AA1]' : 'bg-[#16794A]'}`} />{totalSites === 0 ? 'No sites registered' : `${totalSites} site${totalSites === 1 ? '' : 's'} registered`}</div>
        </article>
      </section>

      <section className={`${card} mb-4 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Latest activity</h2>
            <p className="mt-0.5 text-[11px] text-[#8A938B]">The most recent changes across your operation</p>
          </div>
          <Link href="/reports" className="group inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#2F6B49] hover:underline">All reports <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 xl:grid-cols-4">
          {d?.activity.slice(0, 4).map((a) => {
            const Icon = activityIcon(a.type)
            return <li key={a.id} className="flex min-w-0 gap-2.5 xl:border-l xl:border-[#F1EFEA] xl:pl-3 xl:first:border-l-0 xl:first:pl-0">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F3F2ED] text-[#697166]"><Icon className="size-3.5" strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1"><b className="line-clamp-2 text-[11.5px] font-semibold leading-4 text-[#18181B]">{a.title}</b><p className="mt-0.5 hidden truncate text-[10.5px] text-[#6B6B72] sm:block">{a.body}</p><span className="mt-0.5 block text-[9.5px] text-[#9A9AA1]">{when(a.createdAt)}</span></div>
            </li>
          })}
          {d && d.activity.length === 0 && <li className="py-2 text-xs text-[#6B6B72]">Nothing logged yet today.</li>}
          {!d && <li className="py-2 text-xs text-[#6B6B72]">Loading activity…</li>}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className={`${card} order-2 flex min-h-0 flex-col overflow-hidden xl:order-1`}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F3EE] text-[#526552]"><MapPin className="size-4" strokeWidth={1.75} /></span>
              <div>
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Live map</h2>
                <p className="mt-0.5 text-[11px] text-[#8A938B]">Guard positions and site geofences</p>
              </div>
            </div>
            {d && d.sites.length > 0 && (
              <select aria-label="Zoom to site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 w-full rounded-[8px] border border-[#E4E4E7] bg-white px-2.5 text-xs text-[#3F3F46] sm:w-auto">
                <option value="">All sites</option>
                {d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {d && d.sites.length > 0 ? (
            <WidgetBoundary title="Live map">
              <div className="min-h-[280px] flex-1">
                <LiveMap sites={d.sites as never} guards={d.guards as never} selectedSiteId={siteId || undefined} height="h-full" />
              </div>
            </WidgetBoundary>
          ) : d ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-3 border-t border-[#E4E4E7] text-xs text-[#6B6B72]">
              No sites registered yet.
              <Link href="/sites" className={smallBtn}>Add a site</Link>
            </div>
          ) : <div className="h-[280px] border-t border-[#E4E4E7]"><LoadingBlock label="Loading map…" /></div>}
        </section>

        <div className="order-1 min-w-0 space-y-4 xl:order-2">
          <section className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Attendance by site</h2>
                <p className="mt-0.5 text-[11px] text-[#8A938B]">Today · {checkedToday.size} of {activeGuards.length} guards checked in</p>
              </div>
              <Link href="/attendance" className="group inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#2F6B49] hover:underline">Attendance <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
            </div>
            <ul className="mt-3 max-h-[276px] divide-y divide-[#F1EFEA] overflow-y-auto pr-1">
              {bySite.map((x) => {
                const pct = x.total ? Math.round((x.present / x.total) * 100) : 0
                return <li key={x.name} className="py-2.5 first:pt-1 last:pb-0">
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium text-[#3F3F46]">{x.name}</span><span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-[#52525B]">{x.present}/{x.total}</span></div>
                  <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#16794A]" style={{ width: `${pct}%` }} /></div><span className="w-7 text-right text-[10px] tabular-nums text-[#8A938B]">{pct}%</span></div>
                </li>
              })}
              {d && bySite.length === 0 && <li className="py-4 text-xs leading-5 text-[#6B6B72]">No guards are assigned to active sites yet.</li>}
              {!d && <li className="py-4 text-xs text-[#6B6B72]">Loading sites…</li>}
            </ul>
          </section>

          <section className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Open incidents</h2>
                <p className="mt-0.5 text-[11px] text-[#8A938B]">By severity</p>
              </div>
              <Link href="/incidents" className="group inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#2F6B49] hover:underline">View <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {([
                ['high', 'High', 'bg-[#FDF1EF] ring-[#F2DDD8] text-[#B42318]'],
                ['medium', 'Medium', 'bg-[#FBF5E9] ring-[#EFE2C7] text-[#8A5A12]'],
                ['low', 'Low', 'bg-[#EFF5EF] ring-[#DCE8DC] text-[#2F6B49]'],
              ] as const).map(([sev, label, tone]) => {
                const n = openIncidents.filter((i) => i.severity === sev).length
                return <div key={sev} className={`rounded-[10px] px-1.5 py-2.5 ring-1 ${tone}`}>
                  <dd className="text-[19px] font-semibold leading-none tabular-nums">{d ? n : <Skeleton className="h-5 w-6" />}</dd>
                  <dt className="mt-1 text-[9px] font-semibold uppercase tracking-[0.07em] opacity-80">{label}</dt>
                </div>
              })}
            </dl>
            {openIncidents.length === 0 && <p className="mt-3 text-[10.5px] leading-4 text-[#8A938B]">No open incidents. The board is clear.</p>}
          </section>
        </div>
      </div>
    </>
  )
}
