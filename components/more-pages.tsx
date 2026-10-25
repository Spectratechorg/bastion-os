'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { ASSIGNABLE_ROLES, EDITABLE_ROLES, PERMISSIONS, ROLE_LABELS } from '@/lib/permissions'
import { api, when } from '@/lib/client'
import { GuardAppSettings } from '@/components/guard-app-settings'

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
  const list = [...groups.entries()].map(([name, ss]) => { const names = new Set(ss.map((s) => s.name)); return { name, sites: ss.length, guards: (data?.guards ?? []).filter((g) => g.site && names.has(g.site) && g.status === 'active').length, open: (data?.incidents ?? []).filter((i) => names.has(i.site) && i.status !== 'resolved').length, siteList: ss.map((x) => ({ name: x.name as string, guards: (data?.guards ?? []).filter((g) => g.site === x.name && g.status === 'active').length })) } })
  async function submit(event: FormEvent) { event.preventDefault(); setFormError(''); try { await api('/api/operations', { method: 'PATCH', json: { section: 'sites', id: siteId, action: 'update', clientName: client.trim() || null } }); setOpen(false); setClient(''); setSiteId(''); void load() } catch (e) { setFormError(e instanceof Error ? e.message : 'Unable to save.') } }
  return <>
    <PageHeader title="Clients" subtitle="Companies you protect, with their sites, guards and open incidents."><button className={btnPrimary} onClick={() => setOpen(true)} disabled={sites.length === 0}><Plus className="size-4" />Assign client to site</button></PageHeader>
    <StatStrip stats={[[String(list.filter((c) => c.name !== 'No client assigned').length), 'Clients'], [String(sites.length), 'Sites'], [String(list.reduce((t, c) => t + c.guards, 0)), 'Guards deployed'], [String(list.reduce((t, c) => t + c.open, 0)), 'Open incidents']]} />
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">{!data ? <Spinner /> : list.length === 0 ? <Empty title="No clients yet" text="Add a site, then assign a client to it." /> : <ul className="divide-y divide-zinc-100">{list.map((c) => <li key={c.name} className="p-4 text-xs"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-center"><b className="col-span-2 text-sm font-semibold sm:col-span-1">{c.name}</b>{([['Sites', c.sites], ['Guards deployed', c.guards], ['Open incidents', c.open]] as const).map(([k, v]) => <div key={k}><span className="block text-[10px] uppercase tracking-wide text-zinc-500">{k}</span><span className="font-mono text-sm">{v}</span></div>)}</div>
      <ul className="mt-3 flex flex-wrap gap-2">{c.siteList.map((x) => <li key={x.name} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5"><b className="font-semibold">{x.name}</b><span className="ml-1.5 text-zinc-500">{x.guards} guard{x.guards === 1 ? '' : 's'}</span></li>)}</ul></li>)}</ul>}</div>
    {open && <Sheet title="Assign client to site" kicker="CLIENT" onClose={() => setOpen(false)} footer={<><button className={btn} onClick={() => setOpen(false)}>Cancel</button><button form="client-form" className={btnPrimary} disabled={!siteId}>Save</button></>}><form id="client-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={formError} /><Field label="Site"><select required className={inputClass} value={siteId} onChange={(e) => { setSiteId(e.target.value); setClient(sites.find((s) => s.id === e.target.value)?.clientName ?? '') }}><option value="">Select a site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Client name" hint="Leave empty to remove the client from this site"><input className={inputClass} value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Arbico Plc" /></Field></form></Sheet>}
  </>
}

type Summary = { summary?: { clients: number; finance: { revenue: number; costs: number; pending: number } | null }; attendance: { total: number; outside: number; guards: number }; incidents: { total: number; resolved: number; serious: number }; alerts: { total: number; acknowledged: number }; patrols: { total: number; completed: number }; guards: { total: number }; sites: { total: number }; payroll: { total: number | null; net: string | number | null } }
const lagosDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })

export function ReportsPage() {
  const { data, error, load } = useSections(['activity'])
  const monthStart = lagosDay().slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart); const [to, setTo] = useState(lagosDay()); const [sum, setSum] = useState<Summary | null>(null); const [problem, setProblem] = useState('')
  useEffect(() => { setSum(null); const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to); api<Summary>(`/api/reports?${q}`).then((d) => { setSum(d); setProblem('') }).catch((e) => setProblem(e instanceof Error ? e.message : 'Unable to load the summary.')) }, [from, to])
  const presets: [string, () => void][] = [['Today', () => { setFrom(lagosDay()); setTo(lagosDay()) }], ['Last 7 days', () => { setFrom(lagosDay(-6)); setTo(lagosDay()) }], ['This month', () => { setFrom(monthStart); setTo(lagosDay()) }], ['Last month', () => { const d = new Date(`${monthStart}T00:00:00Z`); const prevEnd = new Date(d.getTime() - 86400000); setFrom(prevEnd.toISOString().slice(0, 8) + '01'); setTo(prevEnd.toISOString().slice(0, 10)) }], ['All time', () => { setFrom(''); setTo('') }]]
  const qs = `${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`
  const cards: [string, string, string, string][] = [
    ['attendance', 'Attendance log', 'Every check-in with guard, site, time, method, geofence result and review status.', sum ? `${sum.attendance.total} check-ins` : '…'],
    ['patrols', 'Patrol log', 'Each daily patrol with the guard, site and how many hourly checkpoints were signed.', sum ? `${sum.patrols.total} patrols` : '…'],
    ['incidents', 'Incident register', 'Title, site, severity, status, assignee and the full timeline.', sum ? `${sum.incidents.total} incidents` : '…'],
    ['alerts', 'Alerts', 'Every alert raised, its severity and whether it was acknowledged.', sum ? `${sum.alerts.total} alerts` : '…'],
    ['payroll', 'Payroll', 'Base pay, days present and absent, deductions, net pay and paid status.', sum && sum.payroll.total !== null ? `${sum.payroll.total} records` : '…'],
    ['guards', 'Guard roster', 'Guards registered in the period, with site, salary and NFC tag.', sum ? `${sum.guards.total} guards` : '…'],
    ['sites', 'Sites', 'Sites added in the period with geofence and client.', sum ? `${sum.sites.total} sites` : '…'],
    ['clients', 'Clients', 'Client accounts with contract value, SLA score and renewal date.', sum ? `${sum.summary?.clients ?? 0} clients` : '…'],
    ['finances', 'Finance ledger', 'Invoices, expenses, budgets and inventory costs with client and site.', sum ? (sum.summary?.finance ? 'Revenue and costs' : 'Not available for your role') : '…'],
  ]
  return <>
    <PageHeader title="Reports" subtitle="Pick a time frame, see the headline numbers, then download any report as a CSV.">
      <button onClick={() => window.print()} className={btn}><Download className="size-3.5" />Print summary</button>
    </PageHeader>
    <ErrorBanner message={problem || error} retry={() => void load()} />
    <section className="mb-4 rounded-[18px] border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3"><Field label="From"><input type="date" className={`${inputClass.replace('w-full', 'w-auto')}`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={`${inputClass.replace('w-full', 'w-auto')}`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-1.5">{presets.map(([label, fn]) => <button key={label} className={smallBtn} onClick={fn}>{label}</button>)}</div></div>
      <p className="mt-2 text-[11px] text-zinc-500">{from || to ? `Showing ${from ? from : 'the beginning'} to ${to ? to : 'today'} (Lagos dates).` : 'Showing all time.'}</p>
    </section>
    <StatStrip stats={[[sum ? String(sum.attendance.total) : '—', 'Check-ins'], [sum ? `${sum.attendance.outside}` : '—', 'Outside geofence'], [sum ? `${sum.patrols.completed}/${sum.patrols.total}` : '—', 'Patrols completed'], [sum ? `${sum.incidents.resolved}/${sum.incidents.total}` : '—', 'Incidents resolved']]} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([key, title, text, count]) => <section key={key} className="flex flex-col rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-start justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="font-mono text-xs text-zinc-500">{count}</span></div><p className="mt-1 flex-1 text-xs text-zinc-500">{text}</p><a href={`/api/export?section=${key}${qs}`} className={`${btn} mt-4 self-start`}><Download className="size-3.5" />Download CSV</a></section>)}</div>
<<<<<<< Updated upstream
    <section className="mt-4 rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Activity log</h2><p className="text-[11px] text-zinc-500">Who changed what in BastionOS, newest first.</p></div><Badge value={`${data?.activity.length ?? 0} events`} /></div><ul className="mt-2 divide-y divide-zinc-100">{!data ? <Spinner /> : data.activity.length === 0 ? <Empty title="No activity yet" /> : data.activity.slice(0, 25).map((a) => <li key={a.id} className="py-2.5 text-xs"><b className="block text-[13px] font-semibold">{a.title}</b><span className="text-zinc-500">{a.body} · {when(a.createdAt)}</span></li>)}</ul></section>
=======
    <section className="mt-4 rounded-[18px] border border-zinc-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Report search</h2><p className="text-[11px] text-zinc-500">Choose a date range, then download the metric-specific report you need above.</p></div><Badge value={`${cards.length} metrics`} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-zinc-50 p-3"><b className="block text-xs">Attendance</b><span className="text-[11px] text-zinc-500">Check-ins, exceptions and review status</span></div><div className="rounded-xl bg-zinc-50 p-3"><b className="block text-xs">Operations</b><span className="text-[11px] text-zinc-500">Patrols, incidents and alerts</span></div><div className="rounded-xl bg-zinc-50 p-3"><b className="block text-xs">Business</b><span className="text-[11px] text-zinc-500">Clients, sites and finance</span></div></div></section>
>>>>>>> Stashed changes
  </>
}

type Member = { id: string; userId: string; role: string; createdAt: string; name: string; email: string; image: string | null; guardId: string | null; guardName: string | null; lastActive: string | null }
type TeamData = { me: string; myRole: string; canManage: boolean; members: Member[] }
type Matrix = { matrix: Record<string, Record<string, boolean>>; canEdit: boolean }

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#2A2B2E]' : 'bg-zinc-300'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button>
}

export function SettingsPage() {
  const [tab, setTab] = useState<'org' | 'team' | 'roles' | 'guardapp'>('org')
  const [team, setTeam] = useState<TeamData | null>(null); const [matrix, setMatrix] = useState<Matrix | null>(null); const [problem, setProblem] = useState('')
  const [editing, setEditing] = useState<Member | 'new' | null>(null); const [viewing, setViewing] = useState<Member | null>(null)
  const refreshTeam = useCallback(async () => { try { const [t, m] = await Promise.all([api<TeamData>('/api/team'), api<Matrix>('/api/permissions')]); setTeam(t); setMatrix(m); setProblem('') } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to load your team.') } }, [])
  useEffect(() => { void refreshTeam() }, [refreshTeam])

  async function flip(role: string, permission: string) {
    if (!matrix) return; const next = !matrix.matrix[role][permission]
    setMatrix({ ...matrix, matrix: { ...matrix.matrix, [role]: { ...matrix.matrix[role], [permission]: next } } })
    try { await api('/api/permissions', { method: 'PATCH', json: { role, permission, allowed: next } }); setProblem('') } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to save.'); void refreshTeam() }
  }
  const tabs = [['org', 'Organisation & defaults'], ['team', 'Team members'], ['roles', 'Roles & permissions'], ['guardapp', 'Guard app & patrol shift']] as const
  return <>
    <PageHeader title="Settings" subtitle="Your organisation, the defaults new records start with, your team and what each role can do.">{tab === 'team' && team?.canManage && <button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="size-4" />Add user</button>}</PageHeader>
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`min-h-[44px] whitespace-nowrap rounded-xl px-4 text-left text-[13px] ${tab === key ? 'bg-white font-semibold shadow-sm' : 'text-zinc-600 hover:bg-white/60'}`}>{label}</button>)}</nav>
    <div className="min-w-0">
    <ErrorBanner message={problem} retry={() => void refreshTeam()} />
    {tab === 'org' && <OrgSettings />}
    {tab === 'guardapp' && <GuardAppSettings />}
    {tab === 'team' && <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {!team ? <Spinner /> : <ul className="divide-y divide-zinc-100">{team.members.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-3 p-4 text-xs"><button onClick={() => setViewing(m)} aria-label={`Open ${m.name}'s profile`} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Avatar name={m.name} src={m.image} size={36} /><span className="min-w-0 flex-1"><b className="block truncate text-[13px] font-semibold">{m.name}{m.userId === team.me && <span className="ml-1.5 font-normal text-zinc-500">(you)</span>}</b><span className="block truncate text-zinc-500">{m.email}</span></span></button><Badge value={ROLE_LABELS[m.role] ?? m.role} />{team.canManage && <button className={smallBtn} onClick={() => setEditing(m)}>Edit</button>}</li>)}</ul>}
      {team && !team.canManage && <p className="border-t border-zinc-100 p-4 text-[11px] text-zinc-500">Only the owner or an administrator can add or edit people.</p>}
    </section>}
    {tab === 'roles' && <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {!matrix ? <Spinner /> : <><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr><th className="px-4 py-3">PERMISSION</th>{['owner', ...EDITABLE_ROLES, 'guard'].map((r) => <th key={r} className="px-3 py-3 text-center">{ROLE_LABELS[r].toUpperCase()}</th>)}</tr></thead>
<<<<<<< Updated upstream
        <tbody>{PERMISSIONS.map((p) => <tr key={p.key} className="border-t border-zinc-100"><td className="px-4 py-3 font-semibold">{p.label}</td>{['owner', ...EDITABLE_ROLES, 'guard'].map((r) => { const locked = r === 'owner' || r === 'guard' || r === 'admin' || !matrix.canEdit; return <td key={r} className="px-3 py-3 text-center"><span className="inline-flex"><Switch on={matrix.matrix[r][p.key]} label={`${ROLE_LABELS[r]}: ${p.label}`} disabled={locked} onChange={() => void flip(r, p.key)} /></span></td> })}</tr>)}</tbody></table></div>
=======
        <tbody>{PERMISSIONS.map((p) => <tr key={p.key} className="border-t border-zinc-100"><td className="px-4 py-3 font-semibold">{p.label}</td>{['owner', ...EDITABLE_ROLES, 'guard'].map((r) => { const locked = r === 'owner' || r === 'guard' || !matrix.canEdit; return <td key={r} className="px-3 py-3 text-center"><span className="inline-flex"><Switch on={matrix.matrix[r][p.key]} label={`${ROLE_LABELS[r]}: ${p.label}`} disabled={locked} onChange={() => void flip(r, p.key)} /></span></td> })}</tr>)}</tbody></table></div>
>>>>>>> Stashed changes
        <p className="border-t border-zinc-100 p-4 text-[11px] text-zinc-500">Owner and Administrator always keep every permission. Guards use only the guard app (scan, patrol checkpoints, SOS) and cannot open the rest of the system.{!matrix.canEdit && ' Only the owner or an administrator can change these switches.'}</p></>}
    </section>}
    </div></div>
    {viewing && team && <ProfileSheet member={viewing} canManage={team.canManage} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null) }} />}
    {editing && team && <UserSheet member={editing === 'new' ? null : editing} team={team} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refreshTeam() }} />}
  </>
}


function OrgSettings() {
  const [d, setD] = useState<{ name: string; settings: { phone: string; address: string; defaultGeofence: number; defaultSalary: number }; canEdit: boolean } | null>(null)
  const [v, setV] = useState({ name: '', phone: '', address: '', defaultGeofence: '100', defaultSalary: '150000' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { api<NonNullable<typeof d>>('/api/settings').then((r) => { setD(r); setV({ name: r.name, phone: r.settings.phone, address: r.settings.address, defaultGeofence: String(r.settings.defaultGeofence), defaultSalary: String(r.settings.defaultSalary) }) }).catch((e) => setErr(e instanceof Error ? e.message : 'Unable to load settings.')) }, [])
  async function save(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); setMsg(''); try { await api('/api/settings', { method: 'PATCH', json: v }); setMsg('Saved. The company name updates in the sidebar next time the page loads.') } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to save.') } finally { setBusy(false) } }
  if (!d && !err) return <section className="rounded-[18px] border border-zinc-200 bg-white"><Spinner /></section>
  const off = !d?.canEdit
  return <form onSubmit={save} className="grid gap-4">
    <ErrorBanner message={err} />
    <section className="rounded-[18px] border border-zinc-200 bg-white p-5"><h2 className="text-[15px] font-semibold">Organisation</h2><p className="mt-0.5 text-xs text-zinc-500">How your company appears in BastionOS and on exports.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Company name"><input required minLength={2} disabled={off} className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field><Field label="Phone"><input disabled={off} className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field><div className="sm:col-span-2"><Field label="Office address"><input disabled={off} className={inputClass} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field></div></div></section>
    <section className="rounded-[18px] border border-zinc-200 bg-white p-5"><h2 className="text-[15px] font-semibold">Defaults for new records</h2><p className="mt-0.5 text-xs text-zinc-500">These pre-fill the forms and drive payroll. Existing records are not changed.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="New site geofence (m)" hint="Check-ins beyond this are flagged"><input type="number" min={10} max={5000} disabled={off} className={inputClass} value={v.defaultGeofence} onChange={(e) => setV({ ...v, defaultGeofence: e.target.value })} /></Field><Field label="New guard salary (₦)"><input type="number" min={0} disabled={off} className={inputClass} value={v.defaultSalary} onChange={(e) => setV({ ...v, defaultSalary: e.target.value })} /></Field></div>
      <p className="mt-3 text-[11px] text-zinc-500">Patrol checkpoints follow the shift set under Patrol shift below.</p></section>
    <div className="flex items-center gap-3"><button className={btnPrimary} disabled={busy || off}>{busy ? 'Saving…' : 'Save settings'}</button>{off && <span className="text-[11px] text-zinc-500">Only the owner or an administrator can change these.</span>}{msg && <span role="status" className="text-xs text-[#16794A]">{msg}</span>}</div>
  </form>
}

function ProfileSheet({ member, canManage, onClose, onEdit }: { member: Member; canManage: boolean; onClose: () => void; onEdit: () => void }) {
  const rows: [string, string][] = [['Email', member.email], ['Role', ROLE_LABELS[member.role] ?? member.role], ['Joined', when(member.createdAt)], ['Last active', member.lastActive ? when(member.lastActive) : 'Not signed in yet'], ...(member.role === 'guard' ? [['Linked guard', member.guardName ?? 'Not linked to a guard record'] as [string, string]] : [])]
  return <Sheet title={member.name} kicker="PROFILE" onClose={onClose} footer={canManage ? <button className={btnPrimary} onClick={onEdit}>Edit user</button> : undefined}>
    <div className="mb-5 flex items-center gap-4"><Avatar name={member.name} src={member.image} size={72} /><div><p className="text-lg font-medium">{member.name}</p><Badge value={ROLE_LABELS[member.role] ?? member.role} /></div></div>
    <dl className="divide-y divide-zinc-100 text-sm">{rows.map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-zinc-500">{k}</dt><dd className="text-right font-medium">{val}</dd></div>)}</dl>
  </Sheet>
}

function UserSheet({ member, team, onClose, onSaved }: { member: Member | null; team: TeamData; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? ''); const [email, setEmail] = useState(member?.email ?? ''); const [password, setPassword] = useState(''); const [role, setRole] = useState(member?.role ?? 'member')
  const [guardId, setGuardId] = useState(member?.guardId ?? ''); const [guardList, setGuardList] = useState<Row[]>([])
  useEffect(() => { api<Row[]>('/api/operations?section=guards').then(setGuardList).catch(() => undefined) }, [])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const isOwnerRow = member?.role === 'owner'; const isSelf = member?.userId === team.me
  const roleLocked = isOwnerRow || isSelf
  async function submit(event: FormEvent) {
    event.preventDefault(); setErr(''); setBusy(true)
    try {
      if (!member) await api('/api/team', { method: 'POST', json: { name, email, role, ...(role === 'guard' && guardId ? { guardId } : {}), ...(password ? { password } : {}) } })
      else await api('/api/team', { method: 'PATCH', json: { memberId: member.id, name, email, ...(roleLocked ? {} : { role }), ...((roleLocked ? member?.role : role) === 'guard' ? { guardId: guardId || null } : {}), ...(password ? { password } : {}) } })
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to save.') } finally { setBusy(false) }
  }
  async function remove() {
    if (!member || !window.confirm(`Remove ${member.name} from your team?`)) return
    setBusy(true); try { await api(`/api/team?memberId=${member.id}`, { method: 'DELETE' }); onSaved() } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to remove.') } finally { setBusy(false) }
  }
  const roleOptions = ASSIGNABLE_ROLES.filter((r) => r !== 'admin' || team.myRole === 'owner' || member?.role === 'admin')
  return <Sheet title={member ? 'Edit user' : 'Add user'} kicker="TEAM" onClose={onClose} footer={<>{member && !isOwnerRow && !isSelf && <button type="button" className={`${btn} mr-auto text-red-700`} onClick={() => void remove()} disabled={busy}>Remove</button>}<button type="button" className={btn} onClick={onClose}>Cancel</button><button form="user-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
    <form id="user-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={err} />
      <Field label="Full name"><input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Role"><select className={inputClass} value={role} disabled={roleLocked} onChange={(e) => setRole(e.target.value)}>{isOwnerRow && <option value="owner">Owner</option>}{roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}{r === 'guard' ? ' (guard app only)' : ''}</option>)}</select></Field>
      {role === 'guard' && <Field label="Guard record" hint="Links this login to the guard, so the guard app knows who is using it and only accepts that guard’s tag"><select className={inputClass} value={guardId} onChange={(e) => setGuardId(e.target.value)}><option value="">Not linked yet</option>{guardList.map((g) => <option key={g.id} value={g.id}>{g.name}{g.site ? ` · ${g.site}` : ''}</option>)}</select></Field>}
      {roleLocked && <p className="text-[11px] text-zinc-500">{isOwnerRow ? 'The owner role cannot be changed.' : 'You cannot change your own role.'}</p>}
      <Field label={member ? 'New password (leave empty to keep)' : 'Temporary password'}><input type="password" minLength={8} required={!member} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    </form></Sheet>
}
