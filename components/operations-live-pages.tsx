'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Download, Map, MessageSquare, Plus, RefreshCw, Search, ShieldAlert, Trash2, UserCog } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api, naira, when } from '@/lib/client'

type Section = 'guards' | 'sites' | 'attendance' | 'patrols' | 'incidents'
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

type PerformanceRow = {
  guardId: string; name: string; photoUrl: string | null; site: string | null
  daysPresent: number; daysAbsent: number; attendanceRate: number
  completedPatrols: number; patrolRate: number; geofenceBreaches: number
}

const config: Record<Section, { title: string; subtitle: string }> = {
  guards: { title: 'Guards', subtitle: 'Everyone on your roster, their site and their NFC card.' },
  sites: { title: 'Sites', subtitle: 'Each protected location, its geofence and the guards assigned to it.' },
  attendance: { title: 'Attendance', subtitle: 'Clock-ins from NFC scans, with geofence exceptions to review.' },
  patrols: { title: 'Patrols', subtitle: 'Hourly patrol checkpoints signed by guards.' },
  incidents: { title: 'Incidents', subtitle: 'Security events from report to resolution.' },
}

const show = (value: unknown, key = '') => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Inside' : 'Outside'
  if (key.endsWith('At')) return when(value)
  return String(value)
}

/** Attendance and patrol rates per guard for a chosen month. */
function GuardPerformance() {
  const [data, setData] = useState<{ period: string; rows: PerformanceRow[] } | null>(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7))

  useEffect(() => {
    let live = true
    api<{ period: string; rows: PerformanceRow[] }>(`/api/performance?period=${period}`)
      .then((body) => { if (live) { setData(body); setError('') } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Unable to load guard performance.') })
    return () => { live = false }
  }, [period])

  const rows = data?.rows ?? []
  return <section className="mt-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 p-4">
      <div><h2 className="text-sm font-semibold">Guard performance</h2><p className="mt-1 text-xs text-zinc-500">Attendance = clock-in days ÷ days on the roster. Patrol = completed patrols ÷ the same days.</p></div>
      <input type="month" aria-label="Performance month" value={period} onChange={(event) => event.target.value && setPeriod(event.target.value)} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs" />
    </header>
    <ErrorBanner message={error} />
    {!data ? <Spinner label="Calculating guard performance…" /> : rows.length === 0 ? <Empty title="No guards yet" text="Register a guard to see their attendance and patrol rates." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['GUARD', 'SITE', 'PRESENT', 'ABSENT', 'ATTENDANCE', 'PATROLS', 'PATROL RATE', 'BREACHES'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.guardId} className="border-t border-zinc-100"><td className="px-4 py-3"><span className="flex items-center gap-2.5"><Avatar name={row.name} src={row.photoUrl} size={28} /><b className="font-semibold">{row.name}</b></span></td><td className="px-4 py-3">{row.site ?? 'Unassigned'}</td><td className="px-4 py-3 font-mono">{row.daysPresent}</td><td className="px-4 py-3 font-mono">{row.daysAbsent}</td><td className="px-4 py-3"><span className="flex items-center gap-2"><span className="font-mono">{row.attendanceRate}%</span><span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full bg-[#2A2B2E]" style={{ width: `${Math.min(row.attendanceRate, 100)}%` }} /></span></span></td><td className="px-4 py-3 font-mono">{row.completedPatrols}</td><td className="px-4 py-3 font-mono">{row.patrolRate}%</td><td className="px-4 py-3 font-mono">{row.geofenceBreaches || '—'}</td></tr>)}</tbody></table></div>}
  </section>
}

function RecordDialog({ section, row, sites, close, done }: { section: Section; row?: Row; sites: Row[]; close: () => void; done: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: String(row?.name ?? ''), nin: String(row?.nin ?? ''), phone: String(row?.phone ?? ''),
    site: String(row?.site ?? ''), monthlySalary: String(row?.monthlySalary ?? '0'),
    address: String(row?.address ?? ''), latitude: String(row?.latitude ?? ''), longitude: String(row?.longitude ?? ''),
    geofenceRadius: String(row?.geofenceRadius ?? '100'), dangerLevel: String(row?.dangerLevel ?? 'low'),
    title: String(row?.title ?? ''), severity: String(row?.severity ?? 'medium'), description: String(row?.description ?? ''),
  }))
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues({ ...values, [key]: event.target.value })

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    const payload: Record<string, unknown> = section === 'guards'
      ? { name: values.name, nin: values.nin, phone: values.phone, site: values.site || null, monthlySalary: Number(values.monthlySalary || 0) }
      : section === 'sites'
        ? { name: values.name, address: values.address, latitude: Number(values.latitude), longitude: Number(values.longitude), geofenceRadius: Number(values.geofenceRadius), dangerLevel: values.dangerLevel }
        : { title: values.title, site: values.site, severity: values.severity, description: values.description }
    const response = await fetch('/api/operations', {
      method: row ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row ? { section, id: row.id, action: 'update', ...payload } : { section, ...payload }),
    })
    const body = await response.json(); setSaving(false)
    if (!response.ok) return setError(body.error ?? 'Unable to save this record.')
    done(); close()
  }

  const label = section === 'guards' ? 'guard' : section === 'sites' ? 'site' : 'incident'
  return <Sheet title={`${row ? 'Edit' : 'Add'} ${label}`} kicker={row ? 'EDIT RECORD' : 'NEW RECORD'} onClose={close}
    footer={<><button type="button" className={btn} onClick={close}>Cancel</button><button form="record-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
    <form id="record-form" onSubmit={submit} className="grid gap-4">
      <ErrorBanner message={error} />
      {section === 'guards' && <>
        <Field label="Full name"><input required minLength={2} className={inputClass} value={values.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input required className={inputClass} value={values.phone} onChange={set('phone')} /></Field>
        <Field label="NIN" hint="11 digits"><input required className={inputClass} value={values.nin} onChange={set('nin')} /></Field>
        <Field label="Site"><select className={inputClass} value={values.site} onChange={set('site')}><option value="">Unassigned</option>{sites.filter((site) => site.status !== 'inactive' || site.name === row?.site).map((site) => <option key={site.id} value={site.name}>{site.name}</option>)}</select></Field>
        <Field label="Monthly salary (₦)" hint="Used by payroll. Only a moderator can change it."><input type="number" min={0} className={inputClass} value={values.monthlySalary} onChange={set('monthlySalary')} /></Field>
      </>}
      {section === 'sites' && <>
        <Field label="Site name"><input required minLength={2} className={inputClass} value={values.name} onChange={set('name')} /></Field>
        <Field label="Address"><input required className={inputClass} value={values.address} onChange={set('address')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"><input required type="number" step="any" className={inputClass} value={values.latitude} onChange={set('latitude')} /></Field>
          <Field label="Longitude"><input required type="number" step="any" className={inputClass} value={values.longitude} onChange={set('longitude')} /></Field>
        </div>
        <Field label="Geofence radius (m)"><input required type="number" min={10} className={inputClass} value={values.geofenceRadius} onChange={set('geofenceRadius')} /></Field>
        <Field label="Risk" hint="Your own assessment of the site's exposure — not calculated by the system, and it does not change alerts."><select className={inputClass} value={values.dangerLevel} onChange={set('dangerLevel')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
      </>}
      {section === 'incidents' && <>
        <Field label="Title"><input required minLength={2} className={inputClass} value={values.title} onChange={set('title')} /></Field>
        <Field label="Site"><select required className={inputClass} value={values.site} onChange={set('site')}><option value="">Select a site</option>{sites.map((site) => <option key={site.id} value={site.name}>{site.name}</option>)}</select></Field>
        <Field label="Severity" hint="Your assessment. Reporting a critical incident raises a critical alert immediately."><select className={inputClass} value={values.severity} onChange={set('severity')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
        <Field label="What happened"><textarea required rows={5} className={`${inputClass} h-auto py-2`} value={values.description} onChange={set('description')} /></Field>
      </>}
    </form>
  </Sheet>
}

function AssignDialog({ row, guards, close, done }: { row: Row; guards: Row[]; close: () => void; done: () => void }) {
  const [guardId, setGuardId] = useState(String(row.assigneeId ?? ''))
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api('/api/operations', { method: 'PATCH', json: { section: 'incidents', id: row.id, action: 'assign', assigneeId: guardId || null } })
      done(); close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to assign this incident.')
    } finally { setSaving(false) }
  }
  return <Sheet title="Assign incident" kicker={String(row.title)} onClose={close}
    footer={<><button className={btn} onClick={close}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Assign'}</button></>}>
    <ErrorBanner message={error} />
    <Field label="Guard handling this incident" hint="Records who is responsible and adds it to the incident timeline. It does not send anything to the guard's phone.">
      <select className={inputClass} value={guardId} onChange={(event) => setGuardId(event.target.value)}>
        <option value="">Unassigned</option>
        {guards.filter((guard) => guard.status === 'active').map((guard) => <option key={guard.id} value={guard.id}>{guard.name}{guard.site ? ` · ${guard.site}` : ''}</option>)}
      </select>
    </Field>
  </Sheet>
}

function IncidentDetail({ row, close }: { row: Row; close: () => void }) {
  return <Sheet title={String(row.title)} kicker={`INCIDENT · ${String(row.status).toUpperCase()}`} onClose={close}>
    <p className="text-sm text-zinc-700">{row.description}</p>
    <p className="mt-2 text-xs text-zinc-500">{row.site} · <Badge value={row.severity} /></p>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-zinc-500">TIMELINE</h3>
    <ol className="space-y-2 border-l border-zinc-200 pl-4 text-xs">{(row.timeline ?? []).map((item: string, index: number) => { const [stamp, ...rest] = item.split(' '); return <li key={index}><span className="block text-[10px] text-zinc-500">{when(stamp)}</span>{rest.join(' ')}</li> })}</ol>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-zinc-500">COMMENTS</h3>
    <ul className="space-y-2 text-xs">{(row.comments ?? []).length === 0 && <li className="text-zinc-500">No comments yet.</li>}{(row.comments ?? []).map((comment: string, index: number) => <li key={index} className="rounded-lg bg-zinc-50 p-2.5">{comment}</li>)}</ul>
  </Sheet>
}

function SiteMap({ sites, guards }: { sites: Row[]; guards: Row[] }) {
  const [selectedId, setSelectedId] = useState('')
  const selected = sites.find((site) => site.id === selectedId) ?? sites[0]
  if (!selected) return <section className="mt-4 rounded-[18px] border border-zinc-200 bg-white p-5 text-xs text-zinc-500">Add a site with coordinates to see its map and geofence.</section>
  const latitude = Number(selected.latitude); const longitude = Number(selected.longitude)
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
  const box = valid ? `${longitude - .015}%2C${latitude - .01}%2C${longitude + .015}%2C${latitude + .01}` : '3.35%2C6.4%3.45%2C6.5'
  const marker = valid ? `&marker=${latitude}%2C${longitude}` : ''
  const assigned = guards.filter((guard) => guard.site === selected.name && guard.status === 'active')
  return <section className="mt-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-4"><Map className="size-4" />
      <label className="text-xs font-semibold">Site map <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="ml-2 rounded border border-zinc-300 px-2 py-1 font-normal">{sites.map((site) => <option key={site.id} value={site.id}>{show(site.name)}</option>)}</select></label>
      <span className="text-[11px] text-zinc-500">{assigned.length} active guard{assigned.length === 1 ? '' : 's'}{assigned.length ? `: ${assigned.map((guard) => guard.name).join(', ')}` : ''}</span>
      <a className="ml-auto text-xs font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}>Open full map</a>
    </div>
    <iframe title={`Map of ${show(selected.name)}`} className="h-72 w-full border-0" src={`https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik${marker}`} />
  </section>
}

export function OperationsLivePage({ section }: { section: Section }) {
  const page = config[section]
  const [records, setRecords] = useState<Row[]>([])
  const [guards, setGuards] = useState<Row[]>([])
  const [sites, setSites] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<{ kind: 'record' | 'detail' | 'assign'; row?: Row } | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const need = (name: string) => api<Row[]>(`/api/operations?section=${name}`)
      const [main, guardRows, siteRows] = await Promise.all([
        need(section),
        section === 'guards' ? Promise.resolve<Row[] | null>(null) : need('guards'),
        section === 'sites' ? Promise.resolve<Row[] | null>(null) : need('sites'),
      ])
      setRecords(main)
      setGuards(guardRows ?? (section === 'guards' ? main : []))
      setSites(siteRows ?? (section === 'sites' ? main : []))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load records.')
    } finally {
      setLoading(false)
    }
  }, [section])

  useEffect(() => { setLoading(true); void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { const term = new URLSearchParams(window.location.search).get('q'); if (term) setQuery(term) }, [section])

  const guardName = (id: string) => guards.find((guard) => guard.id === id)?.name ?? 'Unknown guard'
  const siteName = (id: string | null) => sites.find((site) => site.id === id)?.name ?? '—'
  const guardCount = (name: string) => guards.filter((guard) => guard.site === name && guard.status === 'active').length

  async function act(row: Row, action: string, extra: Record<string, unknown> = {}) {
    setBusy(row.id)
    try {
      const updated = await api<Row>('/api/operations', { method: 'PATCH', json: { section, id: row.id, action, ...extra } })
      setRecords((items) => items.map((item) => item.id === row.id ? { ...item, ...updated } : item))
      setError('')
      return updated
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this record.')
      return null
    } finally { setBusy('') }
  }

  async function remove(row: Row, label: string) {
    if (!window.confirm(`Delete ${label}? This permanently removes the record, together with its attendance, patrol and payroll history where relevant.`)) return
    setBusy(row.id)
    try {
      await api('/api/operations', { method: 'DELETE', json: { section, id: row.id } })
      setRecords((items) => items.filter((item) => item.id !== row.id))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this record.')
    } finally { setBusy('') }
  }

  async function reissue(row: Row) {
    if (!window.confirm(`Issue a new NFC tag code for ${row.name}? The old card stops working immediately.`)) return
    const updated = await act(row, 'reissue-nfc')
    if (updated) setNotice(`New tag code for ${updated.name}: ${updated.nfcToken}. Write it onto a blank card as a plain-text NFC record, then test it in the guard app.`)
  }

  const rows = useMemo(() => {
    const test = query.trim().toLowerCase()
    const filtered = test ? records.filter((row) => JSON.stringify(row).toLowerCase().includes(test)) : records
    if (section === 'incidents') {
      return [...filtered].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || String(b.reportedAt).localeCompare(String(a.reportedAt)))
    }
    if (section === 'attendance') return [...filtered].sort((a, b) => String(b.checkedInAt).localeCompare(String(a.checkedInAt)))
    return filtered
  }, [records, query, section])

  const stats: [string, string][] = section === 'guards'
    ? [[String(records.length), 'Registered'], [String(records.filter((row) => row.status === 'active').length), 'Active'], [String(records.filter((row) => row.status === 'suspended').length), 'Suspended'], [String(records.filter((row) => !row.site).length), 'Unassigned']]
    : section === 'sites'
      ? [[String(records.length), 'Sites'], [String(records.filter((row) => row.status === 'active').length), 'Active'], [String(records.filter((row) => row.status === 'inactive').length), 'Deactivated'], [String(records.filter((row) => row.dangerLevel === 'high').length), 'Marked high risk']]
      : section === 'attendance'
        ? [[String(records.length), 'Check-ins'], [String(records.filter((row) => row.withinGeofence).length), 'Inside geofence'], [String(records.filter((row) => !row.withinGeofence).length), 'Outside geofence'], [String(records.filter((row) => row.reviewStatus === 'flagged').length), 'Flagged for review']]
        : section === 'incidents'
          ? [[String(records.filter((row) => row.status !== 'resolved').length), 'Open'], [String(records.filter((row) => row.severity === 'critical' && row.status !== 'resolved').length), 'Critical open'], [String(records.filter((row) => row.status === 'escalated').length), 'Escalated'], [String(records.filter((row) => row.status === 'resolved').length), 'Resolved']]
          : [[String(records.length), 'Patrols'], [String(records.filter((row) => row.status === 'completed').length), 'Completed'], [String(records.filter((row) => row.status === 'in_progress').length), 'In progress'], [String(records.filter((row) => row.status === 'missed').length), 'Missed']]

  const actions = (row: Row) => {
    if (section === 'guards') return <span className="flex flex-wrap justify-end gap-1.5">
      <button className={smallBtn} disabled={busy === row.id} onClick={() => setDialog({ kind: 'record', row })}>Edit</button>
      <button className={smallBtn} disabled={busy === row.id} onClick={() => void reissue(row)}>New tag</button>
      <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, row.status === 'suspended' ? 'reactivate' : 'suspend')}>{row.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
      <button className={`${smallBtn} text-red-700`} disabled={busy === row.id} onClick={() => void remove(row, row.name)}><Trash2 className="size-3" />Delete</button>
    </span>
    if (section === 'sites') return <span className="flex flex-wrap justify-end gap-1.5">
      <button className={smallBtn} disabled={busy === row.id} onClick={() => setDialog({ kind: 'record', row })}>Edit</button>
      <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, row.status === 'inactive' ? 'reactivate' : 'deactivate')}>{row.status === 'inactive' ? 'Reactivate' : 'Deactivate'}</button>
      <button className={`${smallBtn} text-red-700`} disabled={busy === row.id} onClick={() => void remove(row, row.name)}><Trash2 className="size-3" />Delete</button>
    </span>
    if (section === 'attendance') return <span className="flex justify-end gap-1.5">
      {row.reviewStatus !== 'approved' && <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, 'approve')}><Check className="size-3" />Approve</button>}
      {row.reviewStatus !== 'flagged' && <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, 'flag')}>Flag</button>}
    </span>
    if (section === 'incidents') return <span className="flex flex-wrap justify-end gap-1.5">
      <button className={smallBtn} onClick={() => setDialog({ kind: 'detail', row })}><MessageSquare className="size-3" />Details</button>
      <button className={smallBtn} onClick={() => setDialog({ kind: 'assign', row })}><UserCog className="size-3" />Assign</button>
      {row.status !== 'escalated' && row.status !== 'resolved' && <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, 'escalate')}><ShieldAlert className="size-3" />Escalate</button>}
      {row.status !== 'resolved' && <button className={smallBtn} disabled={busy === row.id} onClick={() => void act(row, 'resolve')}><Check className="size-3" />Resolve</button>}
      <button className={`${smallBtn} text-red-700`} disabled={busy === row.id} onClick={() => void remove(row, row.title)}><Trash2 className="size-3" />Delete</button>
    </span>
    return null
  }

  const cells = (row: Row): React.ReactNode[] => {
    if (section === 'guards') return [
      <span key="guard" className="flex items-center gap-3"><Avatar name={row.name} src={row.photoUrl} /><span><b className="block font-semibold">{row.name}</b><span className="text-zinc-500">{row.phone}</span></span></span>,
      <span key="nin" className="font-mono">{'••••' + String(row.nin ?? '').slice(-4)}</span>,
      <span key="site">{row.site ?? <span className="text-zinc-400">Unassigned</span>}</span>,
      <span key="salary" className="font-mono">{naira(Number(row.monthlySalary ?? 0))}</span>,
      <Badge key="status" value={row.status} />,
      <span key="nfc" className="font-mono text-[11px]">{row.nfcToken ?? '—'}</span>,
    ]
    if (section === 'sites') return [
      <span key="site"><b className="block font-semibold">{row.name}</b><span className="text-zinc-500">{row.address}</span></span>,
      <span key="guards" className={`font-mono ${guardCount(row.name) ? '' : 'text-red-700'}`}>{guardCount(row.name)}</span>,
      <Badge key="risk" value={row.dangerLevel} />,
      <span key="fence" className="font-mono">{row.geofenceRadius} m</span>,
      <Badge key="status" value={row.status} />,
    ]
    if (section === 'attendance') return [
      <b key="guard" className="font-semibold">{guardName(row.guardId)}</b>,
      <span key="site">{siteName(row.siteId)}</span>,
      <span key="in">{when(row.checkedInAt)}</span>,
      <span key="out">{row.checkedOutAt ? when(row.checkedOutAt) : <span className="text-zinc-400">On duty</span>}</span>,
      <Badge key="geofence" value={row.withinGeofence ? 'Inside' : 'Outside'} />,
      <Badge key="review" value={row.reviewStatus} />,
    ]
    if (section === 'incidents') return [
      <span key="incident"><b className="block font-semibold">{row.title}</b><span className="text-zinc-500">{row.site}</span></span>,
      <Badge key="severity" value={row.severity} />,
      <Badge key="status" value={row.status} />,
      <span key="assignee">{row.assigneeId ? guardName(row.assigneeId) : <span className="text-zinc-400">Unassigned</span>}</span>,
      <span key="reported">{when(row.reportedAt)}</span>,
    ]
    return [<b key="guard">{guardName(row.guardId)}</b>, <span key="site">{siteName(row.siteId)}</span>, <span key="checkpoint">{row.checkpoint ?? '—'}</span>, <span key="progress" className="font-mono">{row.progress}%</span>, <Badge key="status" value={row.status} />, <span key="logged">{when(row.loggedAt)}</span>]
  }

  const headers: Record<Section, string[]> = {
    guards: ['GUARD', 'NIN', 'SITE', 'SALARY', 'STATUS', 'NFC TAG'],
    sites: ['SITE', 'GUARDS', 'RISK', 'GEOFENCE', 'STATUS'],
    attendance: ['GUARD', 'SITE', 'CLOCKED IN', 'CLOCKED OUT', 'GEOFENCE', 'REVIEW'],
    patrols: ['GUARD', 'SITE', 'CHECKPOINT', 'PROGRESS', 'STATUS', 'LOGGED'],
    incidents: ['INCIDENT', 'SEVERITY', 'STATUS', 'ASSIGNED TO', 'REPORTED'],
  }

  return <>
    <PageHeader title={page.title} subtitle={page.subtitle}>
      {(section === 'guards' || section === 'sites' || section === 'incidents') && <button className={btnPrimary} onClick={() => setDialog({ kind: 'record' })}><Plus className="size-3.5" />{section === 'guards' ? 'Register guard' : section === 'sites' ? 'Add site' : 'Report incident'}</button>}
    </PageHeader>
    <StatStrip stats={stats} />
    {section === 'sites' && <p className="mb-3 rounded-lg border border-zinc-200 bg-white p-3 text-[11px] text-zinc-600"><b>Risk</b> is your own assessment of a site (low / medium / high), set when you add or edit it. It is not calculated automatically and does not change alerts. <b>Flagged for review</b> means a moderator marked a check-in; <b>outside geofence</b> means the phone was beyond the site radius when it scanned — a record can be both.</p>}
    {notice && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 sm:max-w-sm"><Search className="size-4 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${page.title.toLowerCase()}…`} className="w-full text-xs outline-none" /></label>
      <a href={`/api/export?section=${section}`} className={btn}><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => void load()} className={btn}><RefreshCw className="size-3.5" />Refresh</button>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {loading && !records.length ? <Spinner label="Loading live records…" /> : rows.length === 0 ? <Empty title={query ? 'No records match your search' : `No ${page.title.toLowerCase()} yet`} text={query ? undefined : section === 'guards' ? 'Register your first guard to get started.' : section === 'sites' ? 'Add a site to start tracking coverage.' : section === 'incidents' ? 'Report an incident to track it here.' : 'Records appear here automatically.'} /> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{headers[section].map((head) => <th key={head} className="whitespace-nowrap px-4 py-3">{head}</th>)}<th /></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50">{cells(row).map((cell, index) => <td key={index} className="px-4 py-3 align-middle">{cell}</td>)}<td className="px-4 py-3">{actions(row)}</td></tr>)}</tbody></table></div>
        <ul className="divide-y divide-zinc-100 md:hidden">{rows.map((row) => <li key={row.id} className="p-4 text-xs"><div className="text-sm">{cells(row)[0]}</div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{cells(row).slice(1).map((cell, index) => <div key={index}><dt className="text-[10px] uppercase tracking-wide text-zinc-500">{headers[section][index + 1]}</dt><dd className="mt-0.5">{cell}</dd></div>)}</dl><div className="mt-3">{actions(row)}</div></li>)}</ul>
      </>}
    </div>
    {section === 'sites' && <SiteMap sites={records} guards={guards} />}
    {section === 'attendance' && <GuardPerformance />}
    {dialog?.kind === 'record' && <RecordDialog section={section} row={dialog.row} sites={sites} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'detail' && dialog.row && <IncidentDetail row={records.find((row) => row.id === dialog.row?.id) ?? dialog.row} close={() => setDialog(null)} />}
    {dialog?.kind === 'assign' && dialog.row && <AssignDialog row={dialog.row} guards={guards} close={() => setDialog(null)} done={() => void load()} />}
  </>
}

type OverviewAlert = { id: string; title: string; body: string; severity: string; acknowledged: boolean; createdAt: string }
type OverviewActivity = { id: string; title: string; body: string; type: string; createdAt: string }

export function OverviewLivePage() {
  const [dashboard, setDashboard] = useState<{ kpis: Record<string, number>; alerts: OverviewAlert[]; activities: OverviewActivity[] } | null>(null)
  const [performance, setPerformance] = useState<{ rows: PerformanceRow[]; coverage: { siteId: string; name: string; guardCount: number }[] } | null>(null)
  const [finance, setFinance] = useState<{ income: number; costs: number; profit: number; unsettled: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [dashboardBody, performanceBody, reportBody] = await Promise.all([
        api<{ kpis: Record<string, number>; alerts: OverviewAlert[]; activities: OverviewActivity[] }>('/api/dashboard'),
        api<{ rows: PerformanceRow[]; coverage: { siteId: string; name: string; guardCount: number }[] }>('/api/performance'),
        api<{ summary: { finance: { income: number; costs: number; profit: number; unsettled: number } } }>('/api/reports'),
      ])
      setDashboard(dashboardBody)
      setPerformance(performanceBody)
      setFinance(reportBody.summary.finance)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the overview.')
    }
  }, [])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer) }, [load])

  async function acknowledge(alert: OverviewAlert) {
    setBusy(alert.id)
    try {
      await api('/api/operations', { method: 'PATCH', json: { section: 'alerts', id: alert.id, action: 'update', acknowledged: true } })
      setDashboard((current) => current && { ...current, alerts: current.alerts.map((item) => item.id === alert.id ? { ...item, acknowledged: true } : item) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to acknowledge the alert.')
    } finally { setBusy('') }
  }

  const kpis = dashboard?.kpis ?? {}
  const openAlerts = (dashboard?.alerts ?? []).filter((alert) => !alert.acknowledged)
  const onDuty = (performance?.rows ?? []).filter((row) => row.daysPresent > 0)
  const coverage = performance?.coverage ?? []
  const unusedSites = coverage.filter((site) => site.guardCount === 0)

  return <>
    <PageHeader title="Overview" subtitle="What needs attention right now across your sites.">
      <Link href="/alerts" className={btnPrimary}><ShieldAlert className="size-3.5" />Alerts{openAlerts.length ? ` (${openAlerts.length})` : ''}</Link>
    </PageHeader>
    <StatStrip stats={[
      [String(kpis.activeGuards ?? 0), 'Active guards'],
      [String(kpis.registeredGuards ?? 0), 'On the roster'],
      [`${String(kpis.attendanceRate ?? 0)}%`, 'Checked in today'],
      [String(kpis.openIncidents ?? 0), 'Open incidents'],
    ]} />

    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-4">
          <div><h2 className="text-sm font-semibold">Needs attention</h2><p className="mt-1 text-xs text-zinc-500">Unacknowledged alerts, most severe first.</p></div>
          <Link href="/alerts" className="text-xs font-semibold underline">Open alerts</Link>
        </header>
        {!dashboard ? <Spinner label="Loading alerts…" /> : openAlerts.length === 0 ? <Empty title="Nothing needs attention" text="Alerts appear here when a guard scans outside a geofence, presses SOS, or an incident is escalated." /> : <ul className="divide-y divide-zinc-100">{openAlerts.slice(0, 6).map((alert) => <li key={alert.id} className="flex flex-wrap items-start gap-3 p-4"><Badge value={alert.severity} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{alert.title}</p><p className="mt-0.5 text-[11px] text-zinc-600">{alert.body}</p><p className="mt-1 text-[10px] text-zinc-500">{when(alert.createdAt)}</p></div><button disabled={busy === alert.id} onClick={() => void acknowledge(alert)} className={smallBtn}>Acknowledge</button></li>)}</ul>}
      </section>

      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">This month</h2><p className="mt-1 text-xs text-zinc-500">Money recorded between the 1st and today.</p></header>
        <dl className="grid grid-cols-2 divide-x divide-y divide-zinc-100">
          <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-zinc-500">Income</dt><dd className="mt-1 font-mono text-sm font-semibold text-emerald-700">{naira(finance?.income ?? 0)}</dd></div>
          <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-zinc-500">Costs</dt><dd className="mt-1 font-mono text-sm font-semibold text-red-700">{naira(finance?.costs ?? 0)}</dd></div>
          <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-zinc-500">Profit</dt><dd className="mt-1 font-mono text-sm font-semibold">{naira(finance?.profit ?? 0)}</dd></div>
          <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-zinc-500">Unsettled</dt><dd className="mt-1 font-mono text-sm font-semibold">{naira(finance?.unsettled ?? 0)}</dd></div>
        </dl>
        <div className="border-t border-zinc-100 p-4"><Link href="/finance" className="text-xs font-semibold underline">Open finance</Link></div>
      </section>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Clocked in this month</h2><p className="mt-1 text-xs text-zinc-500">{onDuty.length} guard{onDuty.length === 1 ? '' : 's'} with attendance</p></header>
        {onDuty.length === 0 ? <Empty title="Nobody has clocked in" text="Guards appear here after their first scan." /> : <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto">{onDuty.slice(0, 8).map((row) => <li key={row.guardId} className="flex items-center gap-3 p-3.5"><Avatar name={row.name} src={row.photoUrl} size={30} /><span className="min-w-0 flex-1 text-xs"><b className="block truncate font-semibold">{row.name}</b><span className="text-zinc-500">{row.site ?? 'Unassigned'}</span></span><span className="font-mono text-[11px]">{row.attendanceRate}%</span></li>)}</ul>}
      </section>

      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Site coverage</h2><p className="mt-1 text-xs text-zinc-500">{unusedSites.length ? `${unusedSites.length} site${unusedSites.length === 1 ? '' : 's'} without an active guard` : 'Every site has at least one guard'}</p></header>
        {coverage.length === 0 ? <Empty title="No sites yet" text="Add a site to start tracking coverage." /> : <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto">{coverage.map((site) => <li key={site.siteId} className="flex items-center justify-between gap-3 p-3.5 text-xs"><span className="min-w-0 flex-1 truncate font-semibold">{site.name}</span><span className={`font-mono ${site.guardCount ? 'text-zinc-700' : 'text-red-700'}`}>{site.guardCount} guard{site.guardCount === 1 ? '' : 's'}</span></li>)}</ul>}
      </section>

      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Recent activity</h2><p className="mt-1 text-xs text-zinc-500">Everything the system recorded, newest first.</p></header>
        {!dashboard ? <Spinner /> : (dashboard.activities ?? []).length === 0 ? <Empty title="No activity yet" /> : <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto">{(dashboard.activities ?? []).slice(0, 10).map((activity) => <li key={activity.id} className="p-3.5 text-xs"><b className="block font-semibold">{activity.title}</b><span className="text-zinc-500">{activity.body} · {when(activity.createdAt)}</span></li>)}</ul>}
      </section>
    </div>

    <ErrorBanner message={error} retry={() => void load()} />
  </>
}
