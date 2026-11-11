'use client'

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Check, Copy, Download, LocateFixed, MapPin, MessageSquare, Plus, RefreshCw, Search, ShieldAlert, UserPlus, X } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api, clearClientCache, naira, photoToDataUrl, when } from '@/lib/client'
import { GuardMetrics } from '@/components/guard-metrics'
import { Pagination } from '@/components/pagination'
import { WriteTagButton } from '@/components/write-tag-button'
import { ALERT_RULES } from '@/lib/alerts-client'

export type Section = 'guards' | 'sites' | 'attendance' | 'incidents' | 'alerts'
type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { guards: Row[]; sites: Row[]; act: (row: Row, action: string, extra?: Record<string, unknown>) => Promise<void>; edit: (row: Row) => void; comment: (row: Row) => void; assign: (row: Row) => void; metrics: (row: Row) => void; remove: (row: Row) => void; reissue: (row: Row) => void; open: (row: Row) => void; openMap: (guardId?: string) => void; openSitesMap: (siteId?: string) => void }
type Column = { head: string; cell: (row: Row, ctx: Ctx) => ReactNode }
type Paged = { rows: Row[]; page: number; pageSize: number; total: number; hasMore: boolean; stats?: Record<string, number> }

const guardName = (ctx: Ctx, id: string) => ctx.guards.find((guard) => guard.id === id)?.name ?? 'Former guard'
const siteName = (ctx: Ctx, id: string | null) => ctx.sites.find((site) => site.id === id)?.name ?? '—'

function TagCell({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-[#9A9AA1]">—</span>
  async function copy() {
    try {
      await navigator.clipboard.writeText(value as string)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard permission can be refused; the full value stays available in the title.
    }
  }
  return <button type="button" onClick={() => void copy()} title={value} aria-label={`Copy NFC tag ${value}`} className="group flex max-w-[150px] items-center gap-1.5 font-mono text-[10.5px] text-[#52525B] hover:text-[#18181B]">
    <span className="truncate">{value}</span>
    {copied ? <Check className="size-3 shrink-0 text-[#16794A]" /> : <Copy className="size-3 shrink-0 text-[#9A9AA1] transition-colors group-hover:text-[#52525B]" />}
  </button>
}

function SiteCard({ row, c }: { row: Row; c: Ctx }) {
  const crew = c.guards.filter((guard) => guard.site === row.name)
  const activeCrew = crew.filter((guard) => guard.status === 'active')
  return <article className="flex h-full flex-col rounded-[12px] border border-[#E4E4E7] bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-[#D4D4D8] hover:shadow-[0_10px_28px_-24px_rgba(11,18,15,0.45)]">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F2EC] text-[#3F3F46]"><MapPin className="size-[18px]" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-[#18181B]">{row.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#6B6B72]">{row.address}</p>
        </div>
      </div>
      <Badge value={row.status} />
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F5F6] px-2 py-0.5 text-[10px] font-medium text-[#52525B]">Client · {row.clientName ?? 'Unassigned'}</span>
      <Badge value={row.dangerLevel} />
    </div>

    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-[10px] bg-[#F8F8F6] px-3 py-2.5">
      <div>
        <dt className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8A938B]">Guards</dt>
        <dd className="mt-1 flex items-center gap-1.5">
          <span className="text-[16px] font-semibold leading-none tabular-nums text-[#18181B]">{crew.length}</span>
          {activeCrew.length > 0 && <span className="flex -space-x-1.5" aria-hidden>{activeCrew.slice(0, 3).map((guard) => <span key={guard.id} className="rounded-full ring-2 ring-[#F8F8F6]"><Avatar name={guard.name} src={guard.photoUrl} size={20} /></span>)}</span>}
        </dd>
      </div>
      <div>
        <dt className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8A938B]">Geofence</dt>
        <dd className="mt-1 text-[12px] font-medium tabular-nums text-[#3F3F46]">{row.geofenceRadius} m</dd>
      </div>
      <div>
        <dt className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8A938B]">Risk score</dt>
        <dd className="mt-1 text-[12px] font-medium tabular-nums text-[#3F3F46]">{row.riskScore ?? 0}<span className="ml-0.5 text-[10px] font-normal text-[#8A938B]">pts</span></dd>
      </div>
    </dl>

    <p className="mt-3 line-clamp-2 text-[10.5px] leading-4 text-[#8A938B]" title={row.riskReason}>{row.riskReason}</p>

    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFF1] pt-3">
      <button className={smallBtn} onClick={() => c.openSitesMap(row.id)}><MapPin className="size-3" />Map</button>
      <span className="flex flex-wrap items-center justify-end gap-1">
        <button className={smallBtn} onClick={() => c.edit(row)}>Edit</button>
        {row.status !== 'inactive' ? <button className={smallBtn} onClick={() => window.confirm(`Deactivate ${row.name}? Guards keep their assignment, but the site stops showing as active.`) && void c.act(row, 'deactivate')}>Deactivate</button> : <button className={smallBtn} onClick={() => void c.act(row, 'reactivate')}>Reactivate</button>}
        <button className={`${smallBtn} text-[#B42318]`} onClick={() => c.remove(row)}>Delete</button>
      </span>
    </div>
  </article>
}

const meta: Record<Section, { title: string; subtitle: string; search: string; columns: Column[]; stats: (rows: Row[]) => [string, string][]; addLabel?: string }> = {
  guards: {
    title: 'Guards', subtitle: 'Your security team, their guard IDs, assigned sites and NFC tags.', search: 'Search name, phone, site…', addLabel: 'Register guard',
    stats: (rows) => [[String(rows.length), 'Registered'], [String(rows.filter((x) => x.status === 'active').length), 'Active'], [String(rows.filter((x) => x.status === 'suspended').length), 'Suspended'], [String(rows.filter((x) => x.nfcToken).length), 'NFC issued']],
    columns: [
      { head: 'Guard', cell: (r, c) => <button type="button" onClick={() => c.open(r)} className="flex items-center gap-3 text-left"><Avatar name={r.name} src={r.photoUrl} /><span className="min-w-0"><b className="block truncate font-semibold underline-offset-2 hover:underline">{r.name}</b><span className="block truncate font-mono text-[10.5px] text-[#6B6B72]">{r.phone}</span></span></button> },
      { head: 'Guard ID', cell: (r) => <span className="inline-flex rounded-[6px] bg-[#F0F2EC] px-2 py-1 font-mono text-[11px] font-semibold text-[#3F3F46]">{r.guardCode ?? '—'}</span> },
      { head: 'Site', cell: (r) => <span className="line-clamp-2 block max-w-[200px] leading-snug">{r.site ?? 'Unassigned'}</span> },
      { head: 'Status', cell: (r) => <Badge value={r.status} /> },
      { head: 'NFC tag', cell: (r) => <TagCell value={r.nfcToken} /> },
      { head: '', cell: (r, c) => <span className="flex flex-wrap justify-end gap-1"><button className={smallBtn} onClick={() => c.open(r)}>View</button><button className={smallBtn} onClick={() => c.edit(r)}>Edit</button><button className={`${smallBtn} text-[#B42318]`} onClick={() => c.remove(r)}>Delete</button></span> },
    ],
  },
  sites: {
    title: 'Sites', subtitle: 'Locations, geofences, guards assigned and a risk level worked out from recent incidents and geofence breaches.', search: 'Search site, address, client…', addLabel: 'Add site',
    stats: (rows) => [[String(rows.length), 'Sites'], [String(rows.filter((x) => x.status === 'active').length), 'Active'], [String(rows.reduce((t, x) => t + (x.guardCount ?? 0), 0)), 'Guards deployed'], [String(rows.filter((x) => x.dangerLevel === 'high').length), 'High risk']],
    columns: [
      { head: 'Site', cell: (r) => <span><b className="block font-semibold">{r.name}</b><span className="text-[#6B6B72]">{r.address}</span></span> },
      { head: 'Client', cell: (r) => r.clientName ?? '—' },
      { head: 'Guards', cell: (r) => <span className="font-mono">{r.guardCount ?? 0}</span> },
      { head: 'Risk', cell: (r) => <span title={r.riskReason} className="flex flex-col items-start gap-1"><Badge value={r.dangerLevel} /><span className="max-w-[200px] text-[10px] leading-tight text-[#6B6B72]">{r.riskReason}</span></span> },
      { head: 'Geofence', cell: (r) => `${r.geofenceRadius} m` },
      { head: 'Status', cell: (r) => <Badge value={r.status} /> },
      { head: '', cell: (r, c) => <span className="flex flex-wrap justify-end gap-1.5"><button className={smallBtn} onClick={() => c.edit(r)}>Edit</button>{r.status !== 'inactive' ? <button className={smallBtn} onClick={() => window.confirm(`Deactivate ${r.name}? Guards keep their assignment, but the site stops showing as active.`) && void c.act(r, 'deactivate')}>Deactivate</button> : <button className={smallBtn} onClick={() => void c.act(r, 'reactivate')}>Reactivate</button>}<button className={`${smallBtn} text-[#B42318]`} onClick={() => c.remove(r)}>Delete</button></span> },
    ],
  },
  attendance: {
    title: 'Attendance', subtitle: 'Guard check-ins with the site and geofence result.', search: 'Search guard or site…',
    stats: (rows) => [[String(rows.length), 'Check-ins'], [String(rows.filter((x) => x.withinGeofence).length), 'Inside geofence'], [String(rows.filter((x) => !x.withinGeofence).length), 'Outside geofence']],
    columns: [
      { head: 'Guard', cell: (r, c) => <b className="font-semibold">{guardName(c, r.guardId)}</b> },
      { head: 'Site', cell: (r, c) => siteName(c, r.siteId) },
      { head: 'Check-in', cell: (r) => when(r.checkedInAt) },
      { head: 'Geofence status', cell: (r) => <Badge value={r.withinGeofence ? 'Inside geofence' : 'Outside geofence'} /> },
    ],
  },
  incidents: {
    title: 'Incidents', subtitle: 'Report, assign, escalate and resolve security events.', search: 'Search incident, site, severity…', addLabel: 'Report incident',
    stats: (rows) => [[String(rows.filter((x) => x.status !== 'resolved').length), 'Open'], [String(rows.filter((x) => x.status === 'escalated').length), 'Escalated'], [String(rows.filter((x) => x.status === 'resolved').length), 'Resolved']],
    columns: [
      { head: 'Incident', cell: (r) => <span><b className="block font-semibold">{r.title}</b><span className="text-[#6B6B72]">{r.site}</span></span> },
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
      { head: 'Alert', cell: (r) => <span><b className="block font-semibold">{r.title}</b><span className="text-[#6B6B72]">{r.body}</span></span> },
      { head: 'Severity', cell: (r) => <Badge value={r.severity} /> },
      { head: 'Why this level', cell: (r) => <span className="block max-w-[240px] text-[11px] leading-snug text-[#52525B]">{(ALERT_RULES[r.type] ?? ALERT_RULES.incident).rule}</span> },
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
      <p className="text-[11px] text-[#6B6B72]">Risk level is worked out automatically from incidents and geofence breaches at this site, so there is nothing to set.</p>
    </form>
  </Sheet>
}

function GuardDialog({ row, sites, close, done }: { row: Row; sites: Row[]; close: () => void; done: () => void }) {
  const [v, setV] = useState({ name: row.name, guardCode: row.guardCode ?? '', nin: row.nin, phone: row.phone, site: row.site ?? '', monthlySalary: String(row.monthlySalary) })
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try { await api('/api/operations', { method: 'PATCH', json: { section: 'guards', id: row.id, action: 'update', ...v, site: v.site || null } }); done(); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.') } finally { setSaving(false) }
  }
  return <Sheet title="Edit guard" kicker="GUARD" onClose={close} footer={<><button type="button" className={btn} onClick={close}>Cancel</button><button form="guard-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></>}>
    <form id="guard-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={error} />
      <Field label="Full name"><input required minLength={2} className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Guard ID (3 digits)" hint="Short ID used on the guard app and NFC tag, e.g. 001."><input required inputMode="numeric" maxLength={3} pattern="\d{3}" className={inputClass} value={v.guardCode} onChange={(e) => setV({ ...v, guardCode: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
      <Field label="National Identification Number (NIN)"><input required minLength={4} className={inputClass} value={v.nin} onChange={(e) => setV({ ...v, nin: e.target.value })} /></Field>
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
    <p className="mt-3 text-xs text-[#6B6B72]">Current code: <span className="font-mono">{row.nfcToken ?? '—'}</span></p>
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
    <p className="text-sm text-[#3F3F46]">{row.description}</p><p className="mt-2 text-xs text-[#6B6B72]">{row.site} · <Badge value={row.severity} /></p>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-[#6B6B72]">TIMELINE</h3>
    <ol className="space-y-2 border-l border-[#E4E4E7] pl-4 text-xs">{(row.timeline ?? []).map((item: string, i: number) => { const [stamp, ...rest] = item.split(' '); return <li key={i}><span className="block text-[10px] text-[#6B6B72]">{when(stamp)}</span>{rest.join(' ')}</li> })}</ol>
    <h3 className="mb-2 mt-6 text-xs font-semibold tracking-wide text-[#6B6B72]">COMMENTS</h3>
    <ul className="mb-3 space-y-2 text-xs">{(row.comments ?? []).length === 0 && <li className="text-[#6B6B72]">No comments yet.</li>}{(row.comments ?? []).map((c: string, i: number) => <li key={i} className="rounded-lg bg-[#F5F5F6] p-2.5">{c}</li>)}</ul>
    <form onSubmit={send} className="flex gap-2"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" /><button className={btnPrimary} disabled={busy}>Post</button></form>
  </Sheet>
}

function AssignDialog({ row, guards, close, act }: { row: Row; guards: Row[]; close: () => void; act: Ctx['act'] }) {
  const [id, setId] = useState<string>(row.assigneeId ?? '')
  return <Sheet title="Assign incident" kicker={row.title} onClose={close} footer={<><button className={btn} onClick={close}>Cancel</button><button className={btnPrimary} disabled={!id} onClick={async () => { await act(row, 'assign', { assigneeId: id }); close() }}>Assign</button></>}>
    <p className="mb-4 text-xs leading-5 text-[#52525B]">Assigning names the guard responsible for dealing with this incident. It shows in the “Assigned to” column and on the incident timeline, so everyone knows who owns it.</p>
    <Field label="Guard"><select className={inputClass} value={id} onChange={(e) => setId(e.target.value)}><option value="">Select a guard</option>{guards.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.name}{g.site ? ` · ${g.site}` : ''}</option>)}</select></Field>
  </Sheet>
}

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-96 animate-pulse bg-[#EFEFF1]" /> })

function GuardDetail({ row, c, close }: { row: Row; c: Ctx; close: () => void }) {
  const suspended = row.status === 'suspended'
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [code, setCode] = useState(String(row.guardCode ?? ''))
  const [idBusy, setIdBusy] = useState(false)
  const fields: [string, string, string?][] = [
    ['Guard ID', row.guardCode ?? '—', 'font-mono font-semibold'],
    ['Phone', row.phone ?? '—'],
    ['NIN', row.nin ? `••••${String(row.nin).slice(-4)}` : '—'],
    ['Site', row.site ?? 'Unassigned'],
    ['Monthly salary', naira(Number(row.monthlySalary ?? 0))],
    ['NFC tag', row.nfcToken ?? '—', 'font-mono text-[12px] break-all'],
    ['Last check-in', row.lastCheckIn ? when(row.lastCheckIn) : 'No check-in yet'],
    ['Added', row.createdAt ? when(row.createdAt) : '—'],
    ['Guard login', row.loginUserId ? 'Linked to a user account' : 'Not linked'],
  ]

  async function changePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try { await c.act(row, 'update', { photoUrl: await photoToDataUrl(file, 320) }) } finally { setPhotoBusy(false) }
  }
  async function removePhoto() {
    setPhotoBusy(true)
    try { await c.act(row, 'update', { photoUrl: null }) } finally { setPhotoBusy(false) }
  }
  async function saveCode() {
    if (!/^\d{3}$/.test(code.trim())) return
    setIdBusy(true)
    try { await c.act(row, 'update', { guardCode: code.trim() }) } finally { setIdBusy(false) }
  }

  return <Sheet title={row.name} kicker="GUARD PROFILE" onClose={close} footer={
    <>
      <button className={btn} onClick={() => { close(); c.metrics(row) }}>Performance</button>
      <button className={btn} onClick={() => { close(); c.openMap(row.id) }}>Location</button>
      <button className={btn} onClick={() => { close(); c.reissue(row) }}>Replace tag</button>
      <button className={btn} onClick={() => { close(); c.edit(row) }}>Edit</button>
      <button className={btnPrimary} onClick={async () => { await c.act(row, suspended ? 'reactivate' : 'suspend'); close() }}>{suspended ? 'Reactivate' : 'Suspend'}</button>
    </>
  }>
    <div className="mb-5 flex items-center gap-4">
      <button type="button" onClick={() => photoInput.current?.click()} aria-label="Change guard photo" className="group relative shrink-0 rounded-full" disabled={photoBusy}>
        <Avatar name={row.name} src={row.photoUrl} size={64} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[9px] font-semibold text-white opacity-0 transition group-hover:opacity-100">Edit</span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{row.name}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#6B6B72]"><Badge value={row.status} />{row.site ?? 'Unassigned'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={smallBtn} disabled={photoBusy} onClick={() => photoInput.current?.click()}>{photoBusy ? 'Saving…' : row.photoUrl ? 'Change photo' : 'Add photo'}</button>
          {row.photoUrl && <button type="button" className={`${smallBtn} text-[#B42318]`} disabled={photoBusy} onClick={() => void removePhoto()}>Remove photo</button>}
        </div>
        <input ref={photoInput} type="file" accept="image/*" onChange={changePhoto} className="hidden" />
      </div>
    </div>
    <section className="mb-5 rounded-[10px] border border-[#E4E4E7] bg-[#FAFAFB] p-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6B72]">Guard ID &amp; NFC tag</h3>
      <p className="mt-1 text-[11px] leading-5 text-[#6B6B72]">Set the guard’s 3-digit ID (e.g. 001), then write that ID onto their NFC tag. Scanning the tag in the guard app identifies them without typing.</p>
      <label className="mt-3 block text-[11px] font-medium text-[#52525B]">Guard ID
        <div className="mt-1 flex gap-2">
          <input value={code} inputMode="numeric" maxLength={3} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${inputClass} h-10 font-mono`} aria-label="Guard ID" placeholder="001" />
          <button type="button" className={smallBtn} disabled={idBusy || !/^\d{3}$/.test(code.trim()) || code.trim() === row.guardCode} onClick={() => void saveCode()}>{idBusy ? 'Saving…' : 'Save ID'}</button>
        </div>
      </label>
      <p className="mt-2 text-[10.5px] text-[#8A938B]">Current tag code: <span className="font-mono">{row.nfcToken ?? '—'}</span></p>
      {row.guardCode && <WriteTagButton token={String(row.guardCode)} owner={row.name} writeLabel="Write ID to NFC tag" />}
    </section>
    <dl className="divide-y divide-[#EFEFF1] text-sm">
      {fields.map(([label, value, extra]) => (
        <div key={label} className="flex items-start justify-between gap-6 py-3">
          <dt className="shrink-0 text-[#6B6B72]">{label}</dt>
          <dd className={`text-right font-medium ${extra ?? ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
    <p className="mt-4 text-[11px] text-[#6B6B72]">Performance opens attendance, patrol completion and geofence history. Location opens the guard on the map.</p>
  </Sheet>
}

export function RecordsPage({ section }: { section: Section }) {
  const page = meta[section]
  const searchParams = useSearchParams()
  const [records, setRecords] = useState<Row[]>([]); const [guards, setGuards] = useState<Row[]>([]); const [sites, setSites] = useState<Row[]>([])
  const [query, setQuery] = useState(''); const [term, setTerm] = useState('')
  const [filter, setFilter] = useState('all'); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1); const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0); const [serverStats, setServerStats] = useState<Record<string, number> | null>(null)
  const [mapGuards, setMapGuards] = useState<Row[]>([])
  const [mapOpen, setMapOpen] = useState(false); const [mapGuardId, setMapGuardId] = useState('')
  const [mapMode, setMapMode] = useState<'guards' | 'sites'>('guards')
  const [mapSiteId, setMapSiteId] = useState('')
  const [mapSites, setMapSites] = useState<Row[]>([])
  const [dialog, setDialog] = useState<{ kind: 'site' | 'guard' | 'guard-detail' | 'incident' | 'detail' | 'assign' | 'metrics' | 'reissue' | 'tag'; row?: Row; tag?: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ section, page: String(currentPage), pageSize: String(pageSize), filter, q: term })
      const need = (name: string) => api<Row[]>(`/api/operations?section=${name}`)
      const [main, g, s] = await Promise.all([
        api<Paged>(`/api/operations?${params}`),
        section === 'guards' ? Promise.resolve(null) : need('guards'),
        section === 'sites' ? Promise.resolve(null) : need('sites'),
      ])
      setRecords(main.rows); setTotal(main.total); setServerStats(main.stats ?? null)
      setGuards(g ?? main.rows); setSites(s ?? main.rows); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load records.') } finally { setLoading(false) }
  }, [section, currentPage, pageSize, filter, term])
  useEffect(() => { setFilter('all'); setCurrentPage(1) }, [section])
  useEffect(() => { setLoading(true); void load() }, [load])
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void load() }, 60000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { const q = searchParams.get('q'); if (q) { setQuery(q); setCurrentPage(1) } }, [searchParams])
  useEffect(() => { const timer = window.setTimeout(() => { setTerm(query.trim()); setCurrentPage(1) }, 300); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    if (!mapOpen) return
    let live = true
    if (mapMode === 'guards') api<Row[]>('/api/operations?section=guards').then((rows) => { if (live) setMapGuards(rows) }).catch(() => undefined)
    else api<Row[]>('/api/operations?section=sites').then((rows) => { if (live) setMapSites(rows) }).catch(() => undefined)
    return () => { live = false }
  }, [mapMode, mapOpen])
  useEffect(() => {
    if (!mapOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMapOpen(false); setMapGuardId(''); setMapSiteId('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapOpen])

  const ctx: Ctx = useMemo(() => ({
    guards, sites,
    act: async (row, action, extra = {}) => { try { const updated = await api<Row>('/api/operations', { method: 'PATCH', json: { section, id: row.id, action, ...extra } }); setRecords((items) => items.map((item) => item.id === row.id ? updated : item)); setDialog((d) => d?.row?.id === row.id ? { ...d, row: updated } : d); setError(''); void load() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update.') } },
    edit: (row) => setDialog({ kind: section === 'guards' ? 'guard' : 'site', row }), comment: (row) => setDialog({ kind: 'detail', row }), assign: (row) => setDialog({ kind: 'assign', row }),
    metrics: (row) => setDialog({ kind: 'metrics', row }), reissue: (row) => setDialog({ kind: 'reissue', row }), open: (row) => setDialog({ kind: 'guard-detail', row }), openMap: (guardId = '') => { setMapMode('guards'); setMapGuardId(guardId); setMapOpen(true) }, openSitesMap: (siteId = '') => { setMapMode('sites'); setMapSiteId(siteId); setMapGuardId(''); setMapOpen(true) },
    remove: async (row) => {
      const what = section === 'guards' ? `Delete ${row.name} permanently? Their attendance, patrol and payroll history is deleted with them. To keep the history, suspend the guard instead.` : `Delete ${row.name} permanently? Guards assigned here become unassigned. To keep the record, deactivate the site instead.`
      if (!window.confirm(what)) return
      try { await api(`/api/operations?section=${section}&id=${row.id}`, { method: 'DELETE' }); setRecords((items) => items.filter((item) => item.id !== row.id)); setTotal((value) => Math.max(0, value - 1)); setError(''); void load() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete.') }
    },
  }), [guards, sites, section, load])

  const filterOptions: Record<Section, [string, (r: Row) => boolean][]> = {
    guards: [['all', () => true], ['active', (r) => r.status === 'active'], ['suspended', (r) => r.status === 'suspended']],
    sites: [['all', () => true], ['active', (r) => r.status === 'active'], ['inactive', (r) => r.status === 'inactive']],
    attendance: [['all', () => true], ['outside geofence', (r) => !r.withinGeofence]],
    incidents: [['all', () => true], ['open', (r) => r.status !== 'resolved'], ['critical', (r) => r.severity === 'critical'], ['resolved', (r) => r.status === 'resolved']],
    alerts: [['all', () => true], ['open', (r) => !r.acknowledged], ['high or critical', (r) => r.severity === 'high' || r.severity === 'critical'], ['acknowledged', (r) => r.acknowledged]],
  }
  const rows = records
  const statPairs: [string, string][] = serverStats ? (
    section === 'guards' ? [[String(serverStats.total), 'Registered'], [String(serverStats.active), 'Active'], [String(serverStats.suspended), 'Suspended'], [String(serverStats.nfc), 'NFC issued']]
      : section === 'sites' ? [[String(serverStats.total), 'Sites'], [String(serverStats.active), 'Active'], [String(serverStats.deployed), 'Guards deployed'], [String(serverStats.highRisk), 'High risk']]
        : section === 'attendance' ? [[String(serverStats.total), 'Check-ins'], [String(serverStats.inside), 'Inside geofence'], [String(serverStats.outside), 'Outside geofence']]
          : section === 'incidents' ? [[String(serverStats.total), 'Incidents'], [String(serverStats.open), 'Open'], [String(serverStats.critical), 'Critical'], [String(serverStats.resolved), 'Resolved']]
            : [[String(serverStats.total), 'Alerts'], [String(serverStats.highCritical), 'High or critical'], [String(serverStats.acknowledged), 'Acknowledged']]
  ) : page.stats(records)

  const head = page.columns.filter((c) => c.head)
  const [first, ...rest] = page.columns.slice(0, -1)
  const actions = page.columns[page.columns.length - 1]

  return <>
    <PageHeader title={page.title} subtitle={page.subtitle || undefined}>
      {section === 'guards' && <button className={btn} onClick={() => ctx.openMap()}><MapPin className="size-3.5" />Live locations</button>}
      {section === 'guards' && <Link href="/guards/new" className={btnPrimary}><UserPlus className="size-4" />Register guard</Link>}
      {section === 'sites' && <button className={btn} onClick={() => ctx.openSitesMap()}><MapPin className="size-3.5" />Live map</button>}
      {section === 'sites' && <button className={btnPrimary} onClick={() => setDialog({ kind: 'site' })}><Plus className="size-4" />Add site</button>}
      {section === 'incidents' && <button className={btnPrimary} onClick={() => setDialog({ kind: 'incident' })}><Plus className="size-4" />Report incident</button>}
    </PageHeader>
    <StatStrip stats={statPairs} />
    {section === 'alerts' && <details className="group mb-3 ws-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">
        How alerts get their level
        <span className="text-[10px] font-normal text-[#6B6B72] group-open:hidden">Show</span>
        <span className="hidden text-[10px] font-normal text-[#6B6B72] group-open:inline">Hide</span>
      </summary>
      <ul className="mt-3 grid divide-y divide-[#EFEFF1] text-xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{Object.values(ALERT_RULES).map((r) => <li key={r.label} className="px-3 py-2"><b className="block">{r.label} <span className="font-normal text-[#6B6B72]">· {r.severity}</span></b><span className="text-[#52525B]">{r.rule}</span></li>)}</ul>
      <p className="mt-2 text-[11px] text-[#6B6B72]">Acknowledge an alert once someone has seen it and is dealing with it. Acknowledged alerts stay in the list as a record.</p>
    </details>}
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-[8px] border border-[#E4E4E7] bg-white px-3 sm:h-10 sm:max-w-sm sm:basis-[200px]"><Search className="size-4 text-[#9A9AA1]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={page.search} className="w-full bg-transparent text-xs outline-none" /></label>
      <select aria-label="Filter" className="h-10 min-w-[110px] flex-1 rounded-[8px] border border-[#E4E4E7] bg-white px-3 text-xs capitalize sm:flex-none" value={filter} onChange={(e) => { setFilter(e.target.value); setCurrentPage(1) }}>{filterOptions[section].map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
      <a href={`/api/export?section=${section}`} className={btn}><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => { clearClientCache(); setLoading(true); void load() }} className={btn}><RefreshCw className="size-3.5" />Refresh</button>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    {loading && records.length === 0 ? <div className="ws-card"><Spinner label="Loading live records…" /></div> : rows.length === 0 ? <div className="ws-card"><Empty title={total ? 'No records match your search' : `No ${page.title.toLowerCase()} yet`} text={total ? undefined : section === 'guards' ? 'Register your first guard to get started.' : section === 'sites' ? 'Add a site to start tracking coverage.' : 'Records appear here as they are created.'} /></div> : section === 'sites' ? (
      <div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{rows.map((r) => <SiteCard key={r.id} row={r} c={ctx} />)}</div>
        {total > 0 && <div className="mt-3 overflow-hidden ws-card"><Pagination page={currentPage} pageSize={pageSize} total={total} busy={loading} onPage={setCurrentPage} onPageSize={(size) => { setPageSize(size); setCurrentPage(1) }} /></div>}
      </div>
    ) : (
      <div className="overflow-hidden ws-card">
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-xs"><thead className="border-b border-[#E4E4E7] text-[10.5px] font-medium text-[#8A938B]"><tr>{head.map((c) => <th key={c.head} className="whitespace-nowrap px-4 py-2.5">{c.head}</th>)}<th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-[#EBEFE7] transition-colors hover:bg-[#F5F5F6]">{page.columns.slice(0, -1).map((c) => <td key={c.head} className="px-4 py-2.5 align-middle">{c.cell(r, ctx)}</td>)}<td className="px-4 py-2.5">{actions.cell(r, ctx)}</td></tr>)}</tbody></table></div>
        <ul className="divide-y divide-[#EFEFF1] md:hidden">{rows.map((r) => <li key={r.id} className="p-4 text-xs"><div className="text-sm">{first.cell(r, ctx)}</div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{rest.map((c) => <div key={c.head}><dt className="text-[10px] font-medium text-[#8A938B]">{c.head}</dt><dd className="mt-0.5">{c.cell(r, ctx)}</dd></div>)}</dl><div className="mt-3">{actions.cell(r, ctx)}</div></li>)}</ul>
        {total > 0 && <Pagination page={currentPage} pageSize={pageSize} total={total} busy={loading} onPage={setCurrentPage} onPageSize={(size) => { setPageSize(size); setCurrentPage(1) }} />}
      </div>
    )}
    {dialog?.kind === 'site' && <SiteDialog row={dialog.row} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'guard' && dialog.row && <GuardDialog row={dialog.row} sites={sites} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'incident' && <IncidentDialog sites={sites} close={() => setDialog(null)} done={() => void load()} />}
    {dialog?.kind === 'detail' && dialog.row && <IncidentDetail row={records.find((r) => r.id === dialog.row?.id) ?? dialog.row} close={() => setDialog(null)} act={ctx.act} />}
    {dialog?.kind === 'guard-detail' && dialog.row && <GuardDetail row={dialog.row} c={ctx} close={() => setDialog(null)} />}
    {mapOpen && <div role="dialog" aria-modal="true" aria-label={mapMode === 'guards' ? 'Guard locations' : 'Site locations'} className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) { setMapOpen(false); setMapGuardId(''); setMapSiteId('') } }}>
      <div className="w-full max-w-5xl overflow-hidden rounded-[12px] border border-[#E4E4E7] bg-white shadow-[0_20px_60px_-20px_rgba(11,18,15,0.45)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#E4E4E7] px-4 py-3">
          <div><h2 className="text-[14px] font-semibold">{mapMode === 'guards' ? 'Guard locations' : 'Site locations'}</h2><p className="mt-0.5 text-xs text-[#6B6B72]">{mapMode === 'guards' ? 'Solid markers are real scans; dashed markers sit at the assigned site until a guard scans.' : 'Every registered site with its geofence circle.'}</p></div>
          <button aria-label="Close map" onClick={() => { setMapOpen(false); setMapGuardId('') }} className="flex size-9 shrink-0 items-center justify-center rounded-[7px] text-[#6B6B72] transition-colors hover:bg-[#F0F0F1]"><X className="size-4" /></button>
        </div>
        <LiveMap sites={(mapMode === 'sites' ? mapSites : sites) as never} guards={(mapMode === 'guards' ? mapGuards : []) as never} selectedSiteId={mapMode === 'sites' ? mapSiteId || undefined : undefined} selectedGuardId={mapMode === 'guards' ? mapGuardId || undefined : undefined} height="h-[60vh] sm:h-[68vh]" />
      </div>
    </div>}
    {dialog?.kind === 'metrics' && dialog.row && <GuardMetrics guard={dialog.row as never} photoUrl={dialog.row.photoUrl} close={() => setDialog(null)} />}
    {dialog?.kind === 'reissue' && dialog.row && <ReissueDialog row={dialog.row} close={() => setDialog(null)} done={(tag) => { setDialog({ kind: 'tag', row: dialog.row, tag }); void load() }} />}
    {dialog?.kind === 'tag' && dialog.row && <Sheet title="New tag code" kicker={dialog.row.name} onClose={() => setDialog(null)} footer={<button className={btnPrimary} onClick={() => setDialog(null)}>Done</button>}><p className="text-sm">The old tag no longer works. Write this code to the replacement tag, or give it to {dialog.row.name} to type in the guard app:</p><p className="mt-4 break-all rounded-xl bg-[#EFEFF1] p-4 text-center font-mono text-sm font-semibold tracking-wide">{dialog.tag}</p>{dialog.tag && <WriteTagButton token={dialog.tag} owner={dialog.row.name} />}</Sheet>}
    {dialog?.kind === 'assign' && dialog.row && <AssignDialog row={dialog.row} guards={guards} close={() => setDialog(null)} act={ctx.act} />}
  </>
}
