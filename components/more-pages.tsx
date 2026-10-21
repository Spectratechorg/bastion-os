'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { api, when } from '@/lib/client'

type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

function useSections(names: string[]) {
  const [data, setData] = useState<Record<string, Row[]> | null>(null); const [error, setError] = useState('')
  const load = useCallback(async () => { try { const out = await Promise.all(names.map((n) => api<Row[]>(`/api/operations?section=${n}`))); setData(Object.fromEntries(names.map((n, i) => [n, out[i]]))); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load.') } }, [names.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [load])
  return { data, error, load }
}

export function ClientsPage() {
  const { data, error, load } = useSections(['sites', 'guards', 'incidents'])
  const [open, setOpen] = useState(false); const [siteId, setSiteId] = useState(''); const [client, setClient] = useState(''); const [formError, setFormError] = useState('')
  const sites = data?.sites ?? []
  const groups = new Map<string, Row[]>(); for (const s of sites) { const key = s.clientName || 'No client assigned'; groups.set(key, [...(groups.get(key) ?? []), s]) }
  const list = [...groups.entries()].map(([name, ss]) => { const names = new Set(ss.map((s) => s.name)); return { name, sites: ss.length, guards: (data?.guards ?? []).filter((g) => g.site && names.has(g.site) && g.status === 'active').length, open: (data?.incidents ?? []).filter((i) => names.has(i.site) && i.status !== 'resolved').length, high: ss.filter((s) => s.dangerLevel === 'high').length } })
  async function submit(event: FormEvent) { event.preventDefault(); setFormError(''); try { await api('/api/operations', { method: 'PATCH', json: { section: 'sites', id: siteId, action: 'update', clientName: client.trim() || null } }); setOpen(false); setClient(''); setSiteId(''); void load() } catch (e) { setFormError(e instanceof Error ? e.message : 'Unable to save.') } }
  return <>
    <PageHeader title="Clients" subtitle="Companies you protect, with their sites, guards and open incidents."><button className={btnPrimary} onClick={() => setOpen(true)} disabled={sites.length === 0}><Plus className="size-4" />Assign client to site</button></PageHeader>
    <StatStrip stats={[[String(list.filter((c) => c.name !== 'No client assigned').length), 'Clients'], [String(sites.length), 'Sites'], [String(list.reduce((t, c) => t + c.guards, 0)), 'Guards deployed'], [String(list.reduce((t, c) => t + c.open, 0)), 'Open incidents']]} />
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">{!data ? <Spinner /> : list.length === 0 ? <Empty title="No clients yet" text="Add a site, then assign a client to it." /> : <ul className="divide-y divide-zinc-100">{list.map((c) => <li key={c.name} className="grid grid-cols-2 gap-3 p-4 text-xs sm:grid-cols-5 sm:items-center"><b className="col-span-2 text-sm font-semibold sm:col-span-1">{c.name}</b>{([['Sites', c.sites], ['Guards', c.guards], ['Open incidents', c.open], ['High-risk sites', c.high]] as const).map(([k, v]) => <div key={k}><span className="block text-[10px] uppercase tracking-wide text-zinc-500">{k}</span><span className="font-mono text-sm">{v}</span></div>)}</li>)}</ul>}</div>
    {open && <Sheet title="Assign client to site" kicker="CLIENT" onClose={() => setOpen(false)} footer={<><button className={btn} onClick={() => setOpen(false)}>Cancel</button><button form="client-form" className={btnPrimary} disabled={!siteId}>Save</button></>}><form id="client-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={formError} /><Field label="Site"><select required className={inputClass} value={siteId} onChange={(e) => { setSiteId(e.target.value); setClient(sites.find((s) => s.id === e.target.value)?.clientName ?? '') }}><option value="">Select a site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Client name" hint="Leave empty to remove the client from this site"><input className={inputClass} value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Arbico Plc" /></Field></form></Sheet>}
  </>
}

export function ReportsPage() {
  const { data, error, load } = useSections(['guards', 'sites', 'attendance', 'incidents', 'alerts'])
  const cards: [string, string, string, number | undefined][] = [
    ['guards', 'Guard roster', 'Names, sites, NFC tags and salaries.', data?.guards.length], ['attendance', 'Attendance log', 'Every check-in with geofence and review status.', data?.attendance.length],
    ['patrols', 'Patrol log', 'Daily patrols and their checkpoint progress.', undefined], ['incidents', 'Incident register', 'Severity, status, assignee and timeline.', data?.incidents.length],
    ['payroll', 'Payroll', 'Days absent, pension, net pay and paid status.', undefined], ['sites', 'Sites', 'Locations, geofences and client assignments.', data?.sites.length], ['alerts', 'Alerts', 'Raised alerts and acknowledgements.', data?.alerts.length],
  ]
  return <>
    <PageHeader title="Reports" subtitle="Download your live data as CSV for any section." />
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([key, title, text, count]) => <section key={key} className="flex flex-col rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-start justify-between"><h2 className="text-sm font-semibold">{title}</h2>{count !== undefined && <span className="font-mono text-xs text-zinc-500">{count} rows</span>}</div><p className="mt-1 flex-1 text-xs text-zinc-500">{text}</p><a href={`/api/export?section=${key}`} className={`${btn} mt-4 self-start`}><Download className="size-3.5" />Download CSV</a></section>)}</div>
  </>
}

export function SettingsPage() {
  const { data, error, load } = useSections(['activity'])
  const roles = [['Owner / Administrator', 'Everything, including payroll approval'], ['Moderator', 'Mark payroll as paid; manage guards, sites and incidents'], ['Member', 'View data and handle day-to-day operations']]
  return <>
    <PageHeader title="Settings" subtitle="Roles and the activity log for your organization." />
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><h2 className="text-sm font-semibold">Roles</h2><ul className="mt-2 divide-y divide-zinc-100">{roles.map(([r, t]) => <li key={r} className="py-3 text-xs"><b className="block text-[13px] font-semibold">{r}</b><span className="text-zinc-500">{t}</span></li>)}</ul><p className="mt-2 text-[11px] text-zinc-500">Roles are assigned to people in your organization’s member list.</p></section>
      <section className="rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Activity log</h2><Badge value={`${data?.activity.length ?? 0} events`} /></div><ul className="mt-2 divide-y divide-zinc-100">{!data ? <Spinner /> : data.activity.length === 0 ? <Empty title="No activity yet" /> : data.activity.slice(0, 25).map((a) => <li key={a.id} className="py-2.5 text-xs"><b className="block text-[13px] font-semibold">{a.title}</b><span className="text-zinc-500">{a.body} · {when(a.createdAt)}</span></li>)}</ul></section>
    </div>
  </>
}

