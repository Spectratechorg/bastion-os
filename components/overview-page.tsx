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
  const [error, setError] = useState(''); const [siteId, setSiteId] = useState(''); const [guardId, setGuardId] = useState('')
  const load = useCallback(async () => {
    try {
      const get = (s: string) => api<Row[]>(`/api/operations?section=${s}`)
      const [guards, sites, attendance, incidents, alerts, activity, patrols, payroll] = await Promise.all([get('guards'), get('sites'), get('attendance'), get('incidents'), get('alerts'), get('activity'), api<{ summary: Record<string, number> }>('/api/patrols'), api<{ rows: Row[] }>('/api/payroll').catch(() => ({ rows: [] as Row[] }))])
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
  const openIncidents = d?.incidents.filter((i) => i.status !== 'resolved') ?? []
  const bySite = (d?.sites ?? []).filter((x) => x.status !== 'inactive').map((x) => { const crew = active.filter((g) => g.site === x.name); return { name: x.name as string, total: crew.length, present: crew.filter((g) => checkedToday.has(g.id)).length } }).filter((x) => x.total > 0)
  const riskySites = [...(d?.sites ?? [])].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 3)

  return <>
    <PageHeader title="Operations overview" subtitle="Live activity, coverage and alerts across all sites."><button onClick={() => void load()} className={btn}><RefreshCw className="size-3.5" />Refresh</button></PageHeader>
    <ErrorBanner message={error} retry={() => void load()} />
    <StatStrip stats={[[d ? `${checkedToday.size}/${active.length}` : '—', 'Guards checked in today'], [d ? `${rate}%` : '—', 'Attendance today'], [d ? String(d.patrols.summary.completedToday) : '—', 'Patrols completed today'], [d ? String(d.incidents.filter((i) => i.status !== 'resolved').length) : '—', 'Open incidents']]} />
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="text-sm font-semibold">Live map</h2><p className="mt-0.5 text-xs text-zinc-500">{d ? `${d.sites.length} site${d.sites.length === 1 ? '' : 's'} · guards update as they scan · ${site ? `${site.geofenceRadius} m geofence` : ''}` : 'Loading…'}</p></div>
          {d && d.sites.length > 0 && <select aria-label="Zoom to site" value={siteId} onChange={(e) => { setSiteId(e.target.value); setGuardId('') }} className="h-10 max-w-full rounded-lg border border-zinc-200 px-2 text-xs"><option value="">All sites</option>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</div>
        {d && d.sites.length > 0 ? <LiveMap sites={d.sites as never} guards={d.guards as never} selectedSiteId={siteId || undefined} selectedGuardId={guardId || undefined} height="h-72 sm:h-80" /> : <div className="flex h-72 flex-col items-center justify-center gap-3 border-t border-zinc-200 text-xs text-zinc-500">No sites yet.<Link href="/sites" className={smallBtn}>Add a site</Link></div>}
        {d && d.sites.length > 0 && <div className="border-t border-zinc-200 p-4"><h3 className="text-xs font-semibold">Where guards last checked in</h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{d.guards.filter((g) => g.status === 'active').slice(0, 12).map((g) => { const located = g.lastLatitude != null && g.lastLongitude != null && g.lastCheckIn; return <li key={g.id}><button disabled={!located} onClick={() => { setSiteId(''); setGuardId(g.id) }} className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border px-2.5 text-left text-xs disabled:opacity-60 ${guardId === g.id ? 'border-[#2A2B2E] bg-zinc-50' : 'border-zinc-200 hover:bg-zinc-50'}`}><Avatar name={g.name} src={g.photoUrl} size={28} /><span className="min-w-0 flex-1"><b className="block truncate font-semibold">{g.name}</b><span className="block truncate text-zinc-500">{located ? `${g.site ?? 'Unassigned'} · ${when(g.lastCheckIn)}` : 'No check-in yet'}</span></span></button></li> })}</ul></div>}
      </section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Open alerts</h2><Link href="/alerts" className="text-xs font-semibold underline">All alerts</Link></div>
        <ul className="mt-2 divide-y divide-zinc-100">{openAlerts.slice(0, 8).map((a) => <li key={a.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{a.title}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">{a.body}</p><span className="mt-1 inline-block"><Badge value={a.severity} /></span></div><button onClick={() => void acknowledge(a)} className={smallBtn}>Acknowledge</button></li>)}{openAlerts.length === 0 && <li className="py-10 text-center text-xs text-zinc-500">{d ? 'No open alerts. Nothing needs attention.' : 'Loading…'}</li>}</ul></section>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Open incidents by severity</h2><Link href="/incidents" className="text-xs font-semibold underline">All incidents</Link></div>
        <ul className="mt-4 grid gap-3.5">{(['critical', 'high', 'medium', 'low'] as const).map((sev) => { const n = openIncidents.filter((i) => i.severity === sev).length; return <li key={sev} className="text-xs"><div className="flex justify-between"><span className="capitalize">{sev}</span><b className="font-mono">{n}</b></div><div className="mt-1.5 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-[#2A2B2E]" style={{ width: `${openIncidents.length ? (n / openIncidents.length) * 100 : 0}%` }} /></div></li> })}</ul>
        {d && openIncidents.length === 0 && <p className="mt-4 text-xs text-zinc-500">No open incidents.</p>}</section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Attendance by site today</h2><Link href="/attendance" className="text-xs font-semibold underline">Attendance</Link></div>
        <ul className="mt-4 grid gap-3.5">{bySite.map((x) => <li key={x.name} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate">{x.name}</span><b className="font-mono">{x.present}/{x.total}</b></div><div className="mt-1.5 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-[#2A2B2E]" style={{ width: `${x.total ? (x.present / x.total) * 100 : 0}%` }} /></div></li>)}{d && bySite.length === 0 && <li className="text-xs text-zinc-500">Assign guards to sites to see coverage.</li>}</ul></section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Patrols and risk</h2><Link href="/patrols" className="text-xs font-semibold underline">Patrols</Link></div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">{([['Completed', d?.patrols.summary.completedToday], ['In progress', d?.patrols.summary.inProgressToday], ['Missed', d?.patrols.summary.missedToday]] as const).map(([k, v]) => <div key={k} className="rounded-xl bg-zinc-50 p-3"><dd className="font-mono text-xl font-semibold">{v ?? '—'}</dd><dt className="text-[10px] text-zinc-500">{k}</dt></div>)}</dl>
        <h3 className="mb-1 mt-4 text-xs font-semibold">Riskiest sites (30 days)</h3>
        <ul className="divide-y divide-zinc-100">{riskySites.map((x) => <li key={x.id} className="flex items-center gap-2 py-2 text-xs"><span className="min-w-0 flex-1"><b className="block truncate font-semibold">{x.name}</b><span className="block truncate text-[10px] text-zinc-500">{x.riskReason}</span></span><Badge value={x.dangerLevel} /></li>)}{d && riskySites.length === 0 && <li className="py-2 text-xs text-zinc-500">No sites yet.</li>}</ul>
        {pending.length > 0 && <Link href="/finance/payroll" className="mt-3 block text-xs font-semibold underline">{pending.length} payroll pending · {naira(pending.reduce((t, r) => t + r.netPay, 0))}</Link>}</section>
    </div>
  </>
}
