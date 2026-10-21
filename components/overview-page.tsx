'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, ErrorBanner, btn, smallBtn } from '@/components/ui-bits'
import { api, naira, when } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-72 animate-pulse bg-zinc-100 sm:h-80" /> })

type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

export function OverviewPage() {
  const [d, setD] = useState<{ guards: Row[]; sites: Row[]; attendance: Row[]; incidents: Row[]; alerts: Row[]; activity: Row[]; patrols: { summary: Record<string, number> }; payroll: { rows: Row[] } } | null>(null)
  const [error, setError] = useState(''); const [siteId, setSiteId] = useState('')
  const load = useCallback(async () => {
    try {
      const get = (s: string) => api<Row[]>(`/api/operations?section=${s}`)
      const [guards, sites, attendance, incidents, alerts, activity, patrols, payroll] = await Promise.all([get('guards'), get('sites'), get('attendance'), get('incidents'), get('alerts'), get('activity'), api<{ summary: Record<string, number> }>('/api/patrols'), api<{ rows: Row[] }>('/api/payroll')])
      setD({ guards, sites, attendance, incidents, alerts, activity, patrols, payroll }); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load the overview.') }
  }, [])
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 10000); return () => window.clearInterval(t) }, [load])

  async function acknowledge(alert: Row) { try { await api('/api/operations', { method: 'PATCH', json: { section: 'alerts', id: alert.id, action: 'acknowledge' } }); setD((c) => c && { ...c, alerts: c.alerts.map((a) => a.id === alert.id ? { ...a, acknowledged: true } : a) }) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to acknowledge.') } }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const checkedToday = d ? new Set(d.attendance.filter((a) => new Date(a.checkedInAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today).map((a) => a.guardId)) : new Set<string>()
  const active = d?.guards.filter((g) => g.status === 'active') ?? []
  const rate = active.length ? Math.round((checkedToday.size / active.length) * 100) : 0
  const site = d?.sites.find((s) => s.id === siteId) ?? d?.sites[0]
  const openAlerts = d?.alerts.filter((a) => !a.acknowledged) ?? []
  const pending = d?.payroll.rows.filter((r) => r.status !== 'paid') ?? []

  return <>
    <PageHeader title="Operations overview" subtitle="Live activity, coverage and alerts across all sites."><button onClick={() => void load()} className={btn}><RefreshCw className="size-3.5" />Refresh</button></PageHeader>
    <ErrorBanner message={error} retry={() => void load()} />
    <StatStrip stats={[[d ? `${checkedToday.size}/${active.length}` : '—', 'Guards checked in today'], [d ? `${rate}%` : '—', 'Attendance today'], [d ? String(d.patrols.summary.completedToday) : '—', 'Patrols completed today'], [d ? String(d.incidents.filter((i) => i.status !== 'resolved').length) : '—', 'Open incidents']]} />
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="text-sm font-semibold">Live map</h2><p className="mt-0.5 text-xs text-zinc-500">{d ? `${d.sites.length} site${d.sites.length === 1 ? '' : 's'} · guards update as they scan · ${site ? `${site.geofenceRadius} m geofence` : ''}` : 'Loading…'}</p></div>
          {d && d.sites.length > 0 && <select aria-label="Zoom to site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-10 max-w-full rounded-lg border border-zinc-200 px-2 text-xs"><option value="">All sites</option>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</div>
        {d && d.sites.length > 0 ? <LiveMap sites={d.sites as never} guards={d.guards as never} selectedSiteId={siteId || undefined} height="h-72 sm:h-80" /> : <div className="flex h-72 flex-col items-center justify-center gap-3 border-t border-zinc-200 text-xs text-zinc-500">No sites yet.<Link href="/sites" className={smallBtn}>Add a site</Link></div>}
      </section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Unacknowledged alerts</h2><Link href="/alerts" className="text-xs font-semibold underline">All alerts</Link></div>
        <ul className="mt-2 divide-y divide-zinc-100">{openAlerts.slice(0, 5).map((a) => <li key={a.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{a.title}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">{a.body}</p><span className="mt-1 inline-block"><Badge value={a.severity} /></span></div><button onClick={() => void acknowledge(a)} className={smallBtn}>Acknowledge</button></li>)}{openAlerts.length === 0 && <li className="py-10 text-center text-xs text-zinc-500">{d ? 'No unacknowledged alerts.' : 'Loading…'}</li>}</ul></section>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><h2 className="text-sm font-semibold">Guards on today’s roster</h2><ul className="mt-2 divide-y divide-zinc-100">{active.slice(0, 6).map((g) => <li key={g.id} className="flex items-center gap-3 py-2.5 text-xs"><Avatar name={g.name} src={g.photoUrl} size={32} /><span className="min-w-0 flex-1"><b className="block truncate text-[13px] font-semibold">{g.name}</b><span className="text-zinc-500">{g.site ?? 'Unassigned'}</span></span><Badge value={checkedToday.has(g.id) ? 'Checked in' : 'Pending'} /></li>)}{d && active.length === 0 && <li className="py-8 text-center text-xs text-zinc-500">No active guards. <Link href="/guards/new" className="font-semibold underline">Register a guard</Link></li>}</ul></section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent activity</h2><Link href="/finance/payroll" className="text-xs font-semibold underline">{pending.length} payroll pending · {naira(pending.reduce((t, r) => t + r.netPay, 0))}</Link></div><ul className="mt-2 divide-y divide-zinc-100">{(d?.activity ?? []).slice(0, 6).map((a) => <li key={a.id} className="py-2.5 text-xs"><b className="block text-[13px] font-semibold">{a.title}</b><span className="text-zinc-500">{a.body} · {when(a.createdAt)}</span></li>)}{d && d.activity.length === 0 && <li className="py-8 text-center text-xs text-zinc-500">Activity appears as your team works.</li>}</ul></section>
    </div>
  </>
}
