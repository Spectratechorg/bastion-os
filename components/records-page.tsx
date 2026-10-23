'use client'

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Check, Download, LocateFixed, MessageSquare, Plus, RefreshCw, Search, ShieldAlert, UserPlus } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api, when } from '@/lib/client'
import { GuardMetrics } from '@/components/guard-metrics'
import { ALERT_RULES } from '@/lib/alerts-client'

export type Section = 'guards' | 'sites' | 'attendance' | 'incidents' | 'alerts'
type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { guards: Row[]; sites: Row[]; act: (row: Row, action: string, extra?: Record<string, unknown>) => Promise<void>; edit: (row: Row) => void; comment: (row: Row) => void; assign: (row: Row) => void; metrics: (row: Row) => void; remove: (row: Row) => void; reissue: (row: Row) => void }
type Column = { head: string; cell: (row: Row, ctx: Ctx) => ReactNode }

const guardName = (ctx: Ctx, id: string) => ctx.guards.find((guard) => guard.id === id)?.name ?? 'Unknown guard'
const siteName = (ctx: Ctx, id: string | null) => ctx.sites.find((site) => site.id === id)?.name ?? '—'

const meta: Record<Section, { title: string; subtitle: string; search: string; columns: Column[]; stats: (rows: Row[]) => [string, string][]; addLabel?: string }> = {
  guards: {
    title: 'Guards', subtitle: '', search: 'Search name, phone, site…', addLabel: 'Register guard',
    stats: (rows) => [[String(rows.length), 'Registered'], [String(rows.filter((x) => x.status === 'active').length), 'Active'], [String(rows.filter((x) => x.status === 'suspended').length), 'Suspended'], [String(rows.filter((x) => x.nfcToken).length), 'NFC issued']],
    columns: [
      { head: 'Guard', cell: (r) => <span className="flex items-center gap-3"><Avatar name={r.name} src={r.photoUrl} /><span><b className="block font-semibold">{r.name}</b><span className="text-zinc-500">{r.phone}</span></span></span> },
      { head: 'NIN', cell: (r) => <span className="font-mono">{'••••' + String(r.nin).slice(-4)}</span> },
      { head: 'Site', cell: (r) => r.site ?? 'Unassigned' },
      { head: 'Salary', cell: (r) => `₦${Number(r.monthlySalary).toLocaleString('en-NG')}` },
      { head: 'Status', cell: (r) => <Badge value={r.status} /> },
      { head: 'NFC tag', cell: (r) => <span className="font-mono text-[11px]">{r.nfcToken ?? '—'}</span> },
      { head: '', cell: (r, c) => <span className="flex flex-wrap justify-end gap-1.5"><button className={smallBtn} onClick={() => c.metrics(r)}>Performance</button><button className={smallBtn} onClick={() => c.edit(r)}>Edit</button><button className={smallBtn} onClick={() => c.reissue(r)}>Replace tag</button><button className={smallBtn} onClick={() => void c.act(r, r.status === 'suspended' ? 'reactivate' : 'suspend')}>{r.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button><button className={`${smallBtn} text-[#B42318]`} onClick={() => c.remove(r)}>Delete</button></span> },
    ],
  },
  sites: {
    title: 'Sites', subtitle: 'Locations, geofences, guards assigned and a risk level worked out from recent incidents and geofence breaches.', search: 'Search site, address, client…', addLabel: 'Add site',
    stats: (rows) => [[String(rows.length), 'Sites'], [String(rows.filter((x) => x.status === 'active').length), 'Active'], [String(rows.reduce((t, x) => t + (x.guardCount ?? 0), 0)), 'Guards deployed'], [String(rows.filter((x) => x.dangerLevel === 'high').length), 'High risk']],
    columns: [
      { head: 'Site', cell: (r) => <span><b className="block font-semibold">{r.name}</b><span className="text-zinc-500">{r.address}</span></span> },
      { head: 'Client', cell: (r) => r.clientName ?? '—' },
      { head: 'Guards', cell: (r) => <span className="font-mono">{r.guardCount ?? 0}</span> },
      { head: 'Risk', cell: (r) => <span title={r.riskReason} className="flex flex-col items-start gap-1"><Badge value={r.dangerLevel} /><span className="max-w-[200px] text-[10px] leading-tight text-zinc-500">{r.riskReason}</span></span> },
      { head: 'Geofence', cell: (r) => `${r.geofenceRadius} m` },
      { head: 'Status', cell: (r) => <Badge value={r.status} /> },
      { head: '', cell: (r, c) => <span className="flex flex-wrap justify-end gap-1.5"><button className={smallBtn} onClick={() => c.edit(r)}>Edit</button>{r.status !== 'inactive' ? <button className={smallBtn} onClick={() => window.confirm(`Deactivate ${r.name}? Guards keep their assignment, but the site stops showing as active.`) && void c.act(r, 'deactivate')}>Deactivate</button> : <button className={smallBtn} onClick={() => void c.act(r, 'reactivate')}>Reactivate</button>}<button className={`${smallBtn} text-[#B42318]`} onClick={() => c.remove(r)}>Delete</button></span> },
    ],
  },
  attendance: {
    title: 'Attendance', subtitle: 'Check-ins from NFC scans, with geofence exceptions to review.', search: 'Search guard, site, method…',
    stats: (rows) => [[String(rows.length), 'Check-ins'], [String(rows.filter((x) => x.withinGeofence).length), 'Inside geofence'], [String(rows.filter((x) => !x.withinGeofence).length), 'Outside geofence'], [String(rows.filter((x) => x.reviewStatus === 'flagged').length), 'Flagged']],
    columns: [
      { head: 'Guard', cell: (r, c) => <b className="font-semibold">{guardName(c, r.guardId)}</b> },
      { head: 'Site', cell: (r, c) => siteName(c, r.siteId) },
      { head: 'Checked in', cell: (r) => when(r.checkedInAt) },
      { head: 'Method', cell: (r) => <span className="uppercase">{r.method}</span> },
      { head: 'Geofence', cell: (r) => <Badge value={r.withinGeofence ? 'Inside' : 'Outside'} /> },
      { head: 'Review', cell: (r) => <Badge value={r.reviewStatus} /> },
      { head: '', cell: (r, c) => <span className="flex justify-end gap-1.5">{r.reviewStatus !== 'approved' && <button className={smallBtn} onClick={() => void c.act(r, 'approve')}>Approve</button>}{r.reviewStatus !== 'flagged' && <button className={smallBtn} onClick={() => void c.act(r, 'flag')}>Flag</button>}</span> },
    ],
  },
  incidents: {
    title: 'Incidents', subtitle: 'Report, assign, escalate and resolve security events.', search: 'Search incident, site, severity…', addLabel: 'Report incident',
    stats: (rows) => [[String(rows.filter((x) => x.status !== 'resolved').length), 'Open'], [String(rows.filter((x) => x.severity === 'critical' && x.status !== 'resolved').length), 'Critical open'], [String(rows.filter((x) => x.status === 'escalated').length), 'Escalated'], [String(rows.filter((x) => x.status === 'resolved').length), 'Resolved']],
    columns: [
      { head: 'Incident', cell: (r) => <span><b className="block font-semibold">{r.title}</b><span className="text-zinc-500">{r.site}</span></span> },
      { head: 'Severity', cell: (r) => <Badge value={r.severity} /> },
      { head: 'Status', cell: (r) => <Badge value={r.status} /> },
      { head: 'Assigned to', cell: (r, c) => r.assigneeId ? guardName(c, r.assigneeId) : 'Unassigned' },
      { head: 'Reported', cell: (r) => when(r.reportedAt) },
      { head: '', cell: (r, c) => <span className="flex flex-wrap justify-end gap-1.5"><button className={smallBtn} onClick={() => c.comment(r)}><MessageSquare className="size-3" />Details</button><button className={smallBtn} onClick={() => c.assign(r)}>Assign</button>{r.status !== 'escalated' && r.status !== 'resolved' && <button className={smallBtn} onClick={() => void c.act(r, 'escalate')}><ShieldAlert className="size-3" />Escalate</button>}{r.status !== 'resolved' && <button className={smallBtn} onClick={() => void c.act(r, 'resolve')}><Check className="size-3" />Resolve</button>}</span> },
    ],
  },
  alerts: {
    title: 'Alerts', subtitle: '', search: 'Search alerts…',
    stats: (rows) => [[String(rows.filter((x) => !x.acknowledged).length), 'Open'], [String(rows.filter((x) => !x.acknowledged && (x.severity === 'critical' || x.severity === 'high')).length), 'Open high or critical'], [String(rows.filter((x) => x.acknowledged).length), 'Acknowledged'], [String(rows.length), 'Total']],
    columns: [
      { head: 'Alert', cell: (r) => <span><b className="block font-semibold">{r.title}</b><span className="text-zinc-500">{r.body}</span></span> },
      { head: 'Severity', cell: (r) => <Badge value={r.severity} /> },
      { head: 'Why this level', cell: (r) => <span className="block max-w-[240px] text-[11px] leading-snug text-zinc-600">{(ALERT_RULES[r.type] ?? ALERT_RULES.incident).rule}</span> },
      { head: 'Raised', cell: (r) => when(r.createdAt) },
      { head: 'Status', cell: (r) => <Badge value={r.acknowledged ? 'Acknowledged' : 'Open'} /> },
      { head: '', cell: (r, c) => <span className="flex justify-end">{!r.acknowledged && <button className={smallBtn} onClick={() => void c.act(r, 'acknowledge')}><Check className="size-3" />Acknowledge</button>}</span> },
    ],
  },
}

function SiteDialog({ row, close, done }: { row?: Row; close: () => void; done: () => void }) {
  const [v, setV] = useState({ name: row?.name ?? '', address: row?.address ?? '', latitude: String(row?.latitude ?? ''), longitude: String(row?.longitude ?? ''), geofenceRadius: String(row?.geofenceRadius ?? 100), clientId: row?.clientId ?? '' })
  const [clientList, setClientList] = useState<{ id: string; name: string }[]>([])
  useEffect(() => { api<{ id: string; name: string }[]>('/api/clients').then(setClientList).catch(() => undefined) }, [])
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  useEffect(() => { if (!row) api<{ settings: { defaultGeofence: number } }>('/api/settings').then((d) => setV((c) => ({ ...c, geofenceRadius: String(d.settings.defaultGeofence) }))).catch(() => undefined) }, [row])
  const set = (key: string, value: string) => setV((current) => ({ ...current, [key]: value }))
  function locate() { navigator.geolocation?.getCurrentPosition((p) => setV((c) => ({ ...c, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })), () => setError('Could not read your location. Type the coordinates instead.')) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { ...v, clientId: v.clientId || null }
      await api('/api/operations', { method: row ? 'PATCH' : 'POST', json: row ? { section: 'sites', id: row.id, action: 'update', ...payload } : { section: 'sites', ...payload } })
      done(); close()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.') } finally { setSaving(false) }
  }
  return <Sheet title={row ? 'Edit site' : 'Add site'} kicker="SITE" onClose={close} footer={<><button type="button" className={btn} onClick={close}>Cancel</button><button form="site-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save site'}</button></>}>
    <form id="site-form" onSubmit={submit} className="grid gap-4">
      <ErrorBanner message={error} />
      {!row && <Field label="Site name"><input required minLength={2} className={inputClass} value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>}
      <Field label="Address"><input required minLength={4} className={inputClass} value={v.address} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="Client (optional)" hint="A client can have several sites. Add clients on the Clients page first."><select className={inputClass} value={v.clientId} onChange={(e) => set('clientId', e.target.value)}><option value="">No client</option>{clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Latitude"><input required type="number" step="any" className={inputClass} value={v.latitude} onChange={(e) => set('latitude', e.target.value)} /></Field><Field label="Longitude"><input required type="number" step="any" className={inputClass} value={v.longitude} onChange={(e) => set('longitude', e.target.value)} /></Field></div>
      <button type="button" className={btn} onClick={locate}><LocateFixed className="size-4" />Use my current location</button>
      <Field label="Geofence radius (m)" hint="Check-ins further than this from the site are flagged"><input required type="number" min={10} max={5000} className={inputClass} value={v.geofenceRadius} onChange={(e) => set('geofenceRadius', e.target.value)} /></Field>
      <p className="text-[11px] text-zinc-500">Risk level is worked out automatically from incidents and geofence breaches at this site, so there is nothing to set.</p>
    </form>
  </Sheet>
}

function GuardDialog({ row, sites, close, done }: { row: Row; sites: Row[]; close: () => void; done: () => void }) {
  const [v, setV] = useState({ name: row.name, phone: row.phone, site: row.site ?? '', monthlySalary: String(row.monthlySalary) })
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try { await api('/api/operations', { method: 'PATCH', json: { section: 'guards', id: row.id, action: 'update', ...v, site: v.site || null } }); done(); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.') } finally { setSaving(false) }
  }
  return <Sheet title="Edit guard" kicker="GUARD" onClose={close} footer={<><button type="button" className={btn} onClick={close}>Cancel</button><button form="guard-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></>}>
    <form id="guard-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={error} />
      <Field label="Full name"><input required minLength={2} className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Phone"><input required type="tel" minLength={7} className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
      <Field label="Assigned site"><select className={inputClass} value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })}><option value="">Unassigned</option>{sites.filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></Field>
      <Field label="Monthly salary (₦)" hint="Used by payroll"><input required type="number" min={0} className={inputClass} value={v.monthlySalary} onChange={(e) => setV({ ...v, monthlySalary: e.target.value })} /></Field>
    </form>
  </Sheet>
}

function ReissueDialog({ row, close, done }: { row: Row; close: () => void; done: (tag: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function go() { setBusy(true); setError(''); try { const updated = await api<Row>('/api/operations', { method: 'PATCH', json: { section: 'guards', id: row.id, action: 'reissue-nfc' } }); done(updated.nfcToken) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to replace the tag.') } finally { setBusy(false) } }
  return <Sheet title="Replace NFC tag" kicker={row.name} onClose={close} footer={<><button className={btn} onClick={close}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={() => void go()}>{busy ? 'Working…' : 'Generate new tag code'}</button></>}>
    <ErrorBanner message={error} />
    <p className="text-sm leading-6">Use this when {row.name}’s tag is <b>lost, stolen or damaged</b>. A new code is generated and the old tag stops working immediately, so nobody can use a lost tag to check in.</p>
    <p className="mt-3 text-xs text-zinc-500">Current code: <span className="font-mono">{row.nfcToken ?? '—'}</span></p>
  </Sheet>
}

function IncidentDialog({ sites, close, done }: { sites: Row[]; close: () => void; done: () => void }) {
  const [v, setV] = useState({ title: '', site: sites[0]?.name ?? '', severity: 'medium', description: '' })
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try { await api('/api/operations', { method: 'POST', json: { section: 'incidents', ...v } }); done(); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.') } finally { setSaving(false) }
  }
  return <Sheet title="Report incident" kicker="INCIDENT" onClose={close} footer={<><button type="button" className={btn} onClick={close}>Cancel</button><button form="incident-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Submit report'}</button></>}>
    <form id="incident-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={error} />
      <Field label="Title"><input required minLength={2} className={inputClass} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Access breach at Gate 2" /></Field>
      <Field label="Site"><select required className={inputClass} value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })}>{sites.length === 0 && <option value="">Add a site first</option>}{sites.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></Field>
      <Field label="Severity" hint="High and critical incidents automatically raise an alert"><select className={inputClass} value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
      <Field label="What happened"><textarea required minLength={2} rows={5} className={`${inputClass} h-auto py-2`} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
    </form>
  </Sheet>
}

function IncidentDetail({ row, close, act }: { row: Row; close: () => void; act: Ctx['act'] }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false)
  async function send(event: FormEvent) { event.preventDefault(); if (!text.trim()) return; setBusy(true); await act(row, 'comment', { comment: text.trim() }); setText(''); setBusy(false) }
  return <Sheet title={row.title} kicker={`INCIDENT · ${String(row.status).toUpperCase()}`} onClose={close}>
    <p className="text-sm text-zinc-700">{row.description}</p><p className="mt-2 text-xs text-zinc-500">{row.site} · <Badge value={row.severity} /></p>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-zinc-500">TIMELINE</h3>
    <ol className="space-y-2 border-l border-zinc-200 pl-4 text-xs">{(row.timeline ?? []).map((item: string, i: number) => { const [stamp, ...rest] = item.split(' '); return <li key={i}><span className="block text-[10px] text-zinc-500">{when(stamp)}</span>{rest.join(' ')}</li> })}</ol>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-zinc-500">COMMENTS</h3>
    <ul className="mb-3 space-y-2 text-xs">{(row.comments ?? []).length === 0 && <li className="text-zinc-500">No comments yet.</li>}{(row.comments ?? []).map((c: string, i: number) => <li key={i} className="rounded-lg bg-zinc-50 p-2.5">{c}</li>)}</ul>
    <form onSubmit={send} className="flex gap-2"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" /><button className={btnPrimary} disabled={busy}>Post</button></form>
  </Sheet>
}

function AssignDialog({ row, guards, close, act }: { row: Row; guards: Row[]; close: () => void; act: Ctx['act'] }) {
  const [id, setId] = useState<string>(row.assigneeId ?? '')
  return <Sheet title="Assign incident" kicker={row.title} onClose={close} footer={<><button className={btn} onClick={close}>Cancel</button><button className={btnPrimary} disabled={!id} onClick={async () => { await act(row, 'assign', { assigneeId: id }); close() }}>Assign</button></>}>
    <p className="mb-4 text-xs leading-5 text-zinc-600">Assigning names the guard responsible for dealing with this incident. It shows in the “Assigned to” column and on the incident timeline, so everyone knows who owns it.</p>
    <Field label="Guard"><select className={inputClass} value={id} onChange={(e) => setId(e.target.value)}><option value="">Select a guard</option>{guards.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.name}{g.site ? ` · ${g.site}` : ''}</option>)}</select></Field>
  </Sheet>
}

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-96 animate-pulse bg-zinc-100" /> })

function SiteMap({ sites, guards }: { sites: Row[]; guards: Row[] }) {
  const [id, setId] = useState('')
  if (sites.length === 0) return null
  return <section className="mt-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-4"><b className="text-xs">Live map</b><select aria-label="Zoom to site" value={id} onChange={(e) => setId(e.target.value)} className="h-10 rounded-lg border border-zinc-200 px-2 text-xs"><option value="">All sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><span className="text-xs text-zinc-500">Circles are geofences, coloured by risk. Dark dots are guards at their last check-in.</span></div>
    <LiveMap sites={sites as never} guards={guards as never} selectedSiteId={id || undefined} height="h-96" /></section>
}

export function RecordsPage({ section }: { section: Section }) {
  const page = meta[section]
  const [records, setRecords] = useState<Row[]>([]); const [guards, setGuards] = useState<Row[]>([]); const [sites, setSites] = useState<Row[]>([])
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [dialog, setDialog] = useState<{ kind: 'site' | 'guard' | 'incident' | 'detail' | 'assign' | 'metrics' | 'reissue' | 'tag'; row?: Row; tag?: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const need = (name: string) => api<Row[]>(`/api/operations?section=${name}`)
      const [main, g, s] = await Promise.all([need(section), section === 'guards' ? Promise.resolve(null) : need('guards'), section === 'sites' ? Promise.resolve(null) : need('sites')])
      setRecords(main); setGuards(g ?? main); setSites(s ?? main); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load records.') } finally { setLoading(false) }
  }, [section])
  useEffect(() => { setLoading(true); setFilter('all'); void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { const q = new URLSearchParams(window.location.search).get('q'); if (q) setQuery(q) }, [])

  const ctx: Ctx = useMemo(() => ({
    guards, sites,
    act: async (row, action, extra = {}) => { try { const updated = await api<Row>('/api/operations', { method: 'PATCH', json: { section, id: row.id, action, ...extra } }); setRecords((items) => items.map((item) => item.id === row.id ? updated : item)); setDialog((d) => d?.row?.id === row.id ? { ...d, row: updated } : d); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update.') } },
    edit: (row) => setDialog({ kind: section === 'guards' ? 'guard' : 'site', row }), comment: (row) => setDialog({ kind: 'detail', row }), assign: (row) => setDialog({ kind: 'assign', row }),
    metrics: (row) => setDialog({ kind: 'metrics', row }), reissue: (row) => setDialog({ kind: 'reissue', row }),
    remove: async (row) => {
      const what = section === 'guards' ? `Delete ${row.name} permanently? Their attendance, patrol and payroll history is deleted with them. To keep the history, suspend the guard instead.` : `Delete ${row.name} permanently? Guards assigned here become unassigned. To keep the record, deactivate the site instead.`
      if (!window.confirm(what)) return
      try { await api(`/api/operations?section=${section}&id=${row.id}`, { method: 'DELETE' }); setRecords((items) => items.filter((item) => item.id !== row.id)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete.') }
    },
  }), [guards, sites, section])

  const filterOptions: Record<Section, [string, (r: Row) => boolean][]> = {
    guards: [['all', () => true], ['active', (r) => r.status === 'active'], ['suspended', (r) => r.status === 'suspended']],
    sites: [['all', () => true], ['active', (r) => r.status === 'active'], ['inactive', (r) => r.status === 'inactive']],
    attendance: [['all', () => true], ['flagged', (r) => r.reviewStatus === 'flagged'], ['outside geofence', (r) => !r.withinGeofence], ['approved', (r) => r.reviewStatus === 'approved']],
    incidents: [['all', () => true], ['open', (r) => r.status !== 'resolved'], ['critical', (r) => r.severity === 'critical'], ['resolved', (r) => r.status === 'resolved']],
    alerts: [['all', () => true], ['open', (r) => !r.acknowledged], ['high or critical', (r) => r.severity === 'high' || r.severity === 'critical'], ['acknowledged', (r) => r.acknowledged]],
  }
  const rows = useMemo(() => {
    const test = filterOptions[section].find(([name]) => name === filter)?.[1] ?? (() => true)
    const text = (r: Row) => [...Object.values(r).filter((x) => typeof x === 'string' && !String(x).startsWith('data:')), guardName(ctx, r.guardId), siteName(ctx, r.siteId)].join(' ').toLowerCase()
    return records.filter((r) => test(r) && text(r).includes(query.toLowerCase()))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, query, filter, section, ctx])

  const head = page.columns.filter((c) => c.head)
  const [first, ...rest] = page.columns.slice(0, -1)
  const actions = page.columns[page.columns.length - 1]

  return <>
    <PageHeader title={page.title} subtitle={page.subtitle || undefined}>
      {section === 'guards' && <Link href="/guards/new" className={btnPrimary}><UserPlus className="size-4" />Register guard</Link>}
      {section === 'sites' && <button className={btnPrimary} onClick={() => setDialog({ kind: 'site' })}><Plus className="size-4" />Add site</button>}
      {section === 'incidents' && <button className={btnPrimary} onClick={() => setDialog({ kind: 'incident' })}><Plus className="size-4" />Report incident</button>}
    </PageHeader>
    <StatStrip stats={page.stats(records)} />
    {section === 'alerts' && <section className="mb-3 rounded-[18px] border border-zinc-200 bg-white p-4"><h2 className="text-xs font-semibold">How alerts get their level</h2><ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">{Object.values(ALERT_RULES).map((r) => <li key={r.label} className="rounded-lg bg-zinc-50 p-3"><b className="block">{r.label} <span className="font-normal text-zinc-500">· {r.severity}</span></b><span className="text-zinc-600">{r.rule}</span></li>)}</ul><p className="mt-2 text-[11px] text-zinc-500">Acknowledge an alert once someone has seen it and is dealing with it. Acknowledged alerts stay in the list as a record.</p></section>}
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="flex h-11 min-w-0 flex-1 basis-[200px] items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 sm:h-10 sm:max-w-sm"><Search className="size-4 text-zinc-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={page.search} className="w-full bg-transparent text-xs outline-none" /></label>
      <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-xs capitalize sm:h-10">{filterOptions[section].map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
      <a href={`/api/export?section=${section}`} className={btn}><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => { setLoading(true); void load() }} className={btn}><RefreshCw className="size-3.5" />Refresh</button>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {loading ? <Spinner label="Loading live records…" /> : rows.length === 0 ? <Empty title={records.length ? 'No records match your search' : `No ${page.title.toLowerCase()} yet`} text={records.length ? undefined : section === 'guards' ? 'Register your first guard to get started.' : section === 'sites' ? 'Add a site to start tracking coverage.' : 'Records appear here as they are created.'} /> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{head.map((c) => <th key={c.head} className="whitespace-nowrap px-4 py-3">{c.head.toUpperCase()}</th>)}<th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">{page.columns.slice(0, -1).map((c) => <td key={c.head} className="px-4 py-3 align-middle">{c.cell(r, ctx)}</td>)}<td className="px-4 py-3">{actions.cell(r, ctx)}</td></tr>)}</tbody></table></div>
        <ul className="divide-y divide-zinc-100 md:hidden">{rows.map((r) => <li key={r.id} className="p-4 text-xs"><div className="text-sm">{first.cell(r, ctx)}</div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{rest.map((c) => <div key={c.head}><dt className="text-[10px] uppercase tracking-wide text-zinc-500">{c.head}</dt><dd className="mt-0.5">{c.cell(r, ctx)}</dd></div>)}</dl><div className="mt-3">{actions.cell(r, ctx)}</div></li>)}</ul></>}
    </div>
    {section === 'sites' && <SiteMap sites={rows} guards={guards} />}
    {dialog?.kind === 'site' && <SiteDialog row={dialog.row} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'guard' && dialog.row && <GuardDialog row={dialog.row} sites={sites} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'incident' && <IncidentDialog sites={sites} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'detail' && dialog.row && <IncidentDetail row={records.find((r) => r.id === dialog.row?.id) ?? dialog.row} close={() => setDialog(null)} act={ctx.act} />}
    {dialog?.kind === 'metrics' && dialog.row && <GuardMetrics guard={dialog.row as never} photoUrl={dialog.row.photoUrl} close={() => setDialog(null)} />}
    {dialog?.kind === 'reissue' && dialog.row && <ReissueDialog row={dialog.row} close={() => setDialog(null)} done={(tag) => { setDialog({ kind: 'tag', row: dialog.row, tag }); void load() }} />}
    {dialog?.kind === 'tag' && dialog.row && <Sheet title="New tag code" kicker={dialog.row.name} onClose={() => setDialog(null)} footer={<button className={btnPrimary} onClick={() => setDialog(null)}>Done</button>}><p className="text-sm">The old tag no longer works. Write this code to the replacement tag, or give it to {dialog.row.name} to type in the guard app:</p><p className="mt-4 rounded-xl bg-zinc-100 p-4 text-center font-mono text-xl font-semibold tracking-wider">{dialog.tag}</p></Sheet>}
    {dialog?.kind === 'assign' && dialog.row && <AssignDialog row={dialog.row} guards={guards} close={() => setDialog(null)} act={ctx.act} />}
  </>
}
