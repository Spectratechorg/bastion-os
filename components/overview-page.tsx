'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Badge, ErrorBanner, btn, smallBtn } from '@/components/ui-bits'
import { WidgetBoundary } from '@/components/widget-boundary'
import { api, when } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-72 animate-pulse bg-[#EFEFF1] sm:h-80" /> })

type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

export function OverviewPage() {
  const [d, setD] = useState<{ guards: Row[]; sites: Row[]; attendance: Row[]; incidents: Row[]; alerts: Row[]; activity: Row[]; patrols: { summary: Record<string, number> } } | null>(null)
  const [error, setError] = useState(''); const [siteId, setSiteId] = useState('')
  const load = useCallback(async () => {
    const get = (s: string) => api<Row[]>(`/api/operations?section=${s}`)
    // Settle every section independently: one failing endpoint must not blank the whole dashboard.
    const results = await Promise.allSettled([
      get('guards'), get('sites'), get('attendance'), get('incidents'), get('alerts'), get('activity'),
      api<{ summary: Record<string, number> }>('/api/patrols'),
    ])
    const labels = ['guards', 'sites', 'attendance', 'incidents', 'alerts', 'activity', 'patrols']
    const failed = results.flatMap((result, index) => result.status === 'rejected' ? [labels[index]] : [])
    const pick = <T,>(index: number, fallback: T): T => results[index].status === 'fulfilled' ? results[index].value as T : fallback
    setD({
      guards: pick<Row[]>(0, []),
      sites: pick<Row[]>(1, []),
      attendance: pick<Row[]>(2, []),
      incidents: pick<Row[]>(3, []),
      alerts: pick<Row[]>(4, []),
      activity: pick<Row[]>(5, []),
      patrols: pick<{ summary: Record<string, number> }>(6, { summary: {} }),
    })
    setError(failed.length ? `Some sections could not load (${failed.join(', ')}). The rest of the page is still usable.` : '')
  }, [])
  useEffect(() => { void load(); const t = window.setInterval(() => { if (!document.hidden) void load() }, 60000); return () => window.clearInterval(t) }, [load])

  async function acknowledge(alert: Row) { try { await api('/api/operations', { method: 'PATCH', json: { section: 'alerts', id: alert.id, action: 'acknowledge' } }); setD((c) => c && { ...c, alerts: c.alerts.map((a) => a.id === alert.id ? { ...a, acknowledged: true } : a) }) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to acknowledge.') } }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const checkedToday = d ? new Set(d.attendance.filter((a) => new Date(a.checkedInAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today).map((a) => a.guardId)) : new Set<string>()
  const active = d?.guards.filter((g) => g.status === 'active') ?? []
  const rate = active.length ? Math.round((checkedToday.size / active.length) * 100) : 0
  const openAlerts = d?.alerts.filter((a) => !a.acknowledged) ?? []
  const openIncidents = d?.incidents.filter((i) => i.status !== 'resolved') ?? []
  const bySite = (d?.sites ?? []).filter((x) => x.status !== 'inactive').map((x) => { const crew = active.filter((g) => g.site === x.name); return { name: x.name as string, total: crew.length, present: crew.filter((g) => checkedToday.has(g.id)).length } }).filter((x) => x.total > 0)

  return <>
    <PageHeader title="Operations overview" subtitle="Live activity, coverage and alerts across all sites."><button onClick={() => void load()} className={btn}><RefreshCw className="size-3.5" />Refresh</button></PageHeader>
    <ErrorBanner message={error} retry={() => void load()} />
    <StatStrip stats={[[d ? `${checkedToday.size}/${active.length}` : '—', 'Checked in today'], [d ? `${rate}%` : '—', 'Attendance'], [d ? String(d.patrols.summary.completedToday) : '—', 'Patrols done'], [d ? String(d.incidents.filter((i) => i.status !== 'resolved').length) : '—', 'Open incidents']]} />

    <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
      <section className="min-w-0 overflow-hidden ws-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Live map</h2>
            <p className="mt-0.5 text-xs text-[#6B6B72]">{d ? `${d.sites.length} site${d.sites.length === 1 ? '' : 's'} · guards update as they scan` : 'Loading…'}</p>
          </div>
          {d && d.sites.length > 0 && <select aria-label="Zoom to site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 w-full rounded-[8px] border border-[#E4E4E7] bg-white px-2 text-xs sm:w-auto"><option value="">All sites</option>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        </div>
        {d && d.sites.length > 0 ? <WidgetBoundary title="Live map"><LiveMap sites={d.sites as never} guards={d.guards as never} selectedSiteId={siteId || undefined} height="h-64 sm:h-80" /></WidgetBoundary> : <div className="flex h-64 flex-col items-center justify-center gap-3 border-t border-[#E4E4E7] text-xs text-[#6B6B72]">No sites yet.<Link href="/sites" className={smallBtn}>Add a site</Link></div>}
      </section>

      <div className="min-w-0 space-y-4">
        <section className="min-w-0 ws-card p-4">
          <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Open alerts</h2><Link href="/alerts" className="text-xs font-semibold underline">All alerts</Link></div>
          <ul className="mt-2 divide-y divide-[#EFEFF1]">{openAlerts.slice(0, 6).map((a) => <li key={a.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{a.title}</p><p className="mt-0.5 truncate text-[11px] text-[#6B6B72]">{a.body}</p><span className="mt-1 inline-block"><Badge value={a.severity} /></span></div><button onClick={() => void acknowledge(a)} className={smallBtn}>Acknowledge</button></li>)}{openAlerts.length === 0 && <li className="py-8 text-center text-xs text-[#6B6B72]">{d ? 'No open alerts. Nothing needs attention.' : 'Loading…'}</li>}</ul>
        </section>

        <section className="min-w-0 ws-card p-4">
          <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Open incidents</h2><Link href="/incidents" className="text-xs font-semibold underline">All incidents</Link></div>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] bg-[#EFEFF1] text-center">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const n = openIncidents.filter((i) => i.severity === sev).length
              return <div key={sev} className="bg-white px-3 py-3"><dd className="font-mono text-lg font-semibold tabular-nums">{n}</dd><dt className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#6B6B72]">{sev}</dt></div>
            })}
          </dl>
          {d && openIncidents.length === 0 && <p className="mt-3 text-xs text-[#6B6B72]">No open incidents.</p>}
        </section>
      </div>
    </div>

    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 ws-card p-4">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Attendance by site today</h2><Link href="/attendance" className="text-xs font-semibold underline">Attendance</Link></div>
        <ul className="mt-3 grid gap-3">{bySite.map((x) => <li key={x.name} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate">{x.name}</span><b className="font-mono tabular-nums">{x.present}/{x.total}</b></div><div className="mt-1.5 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#2A2B2E]" style={{ width: `${x.total ? (x.present / x.total) * 100 : 0}%` }} /></div></li>)}{d && bySite.length === 0 && <li className="text-xs text-[#6B6B72]">Assign guards to sites to see coverage.</li>}</ul>
      </section>

      <section className="min-w-0 ws-card p-4">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Latest activity</h2><Link href="/reports" className="text-xs font-semibold underline">Reports</Link></div>
        <ul className="mt-2 divide-y divide-[#EFEFF1]">{d?.activity.slice(0, 6).map((a) => <li key={a.id} className="py-2.5 text-xs"><b className="block truncate text-[12.5px] font-semibold">{a.title}</b><span className="mt-0.5 block truncate text-[11px] text-[#6B6B72]">{a.body} · {when(a.createdAt)}</span></li>)}{d && d.activity.length === 0 && <li className="py-6 text-center text-xs text-[#6B6B72]">Nothing has happened yet.</li>}{!d && <li className="py-6 text-center text-xs text-[#6B6B72]">Loading…</li>}</ul>
      </section>
    </div>
  </>
}
