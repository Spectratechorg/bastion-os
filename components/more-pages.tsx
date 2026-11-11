'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  Activity, Bell, BriefcaseBusiness, Clock3, Download, FileText, Mail, MapPin, Plus, Route, ShieldAlert, Users, Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Field, Sheet, Skeleton, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { ASSIGNABLE_ROLES, EDITABLE_ROLES, PERMISSIONS, ROLE_LABELS } from '@/lib/permissions'
import { api, when } from '@/lib/client'
import { GuardAppSettings } from '@/components/guard-app-settings'
import { AccountSettings } from '@/components/account-settings'
import { FINANCE_ENABLED } from '@/lib/features'

type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

type Summary = { summary?: { clients: number; finance: { revenue: number; costs: number; pending: number } | null }; attendance: { total: number; outside: number; guards: number }; incidents: { total: number; resolved: number; serious: number }; alerts: { total: number; acknowledged: number }; patrols: { total: number; completed: number }; guards: { total: number }; sites: { total: number }; payroll: { total: number | null; net: string | number | null } }
const lagosDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function periodLabel(from: string, to: string) {
  if (!from && !to) return 'all time'
  return `${from || 'the beginning'} to ${to || 'today'}`
}

function reportLines(sum: Summary): string[] {
  const openAlerts = Math.max(0, sum.alerts.total - sum.alerts.acknowledged)
  const unresolved = Math.max(0, sum.incidents.total - sum.incidents.resolved)
  const missedPatrols = Math.max(0, sum.patrols.total - sum.patrols.completed)
  return [
    `Attendance: ${plural(sum.attendance.total, 'check-in')} from ${plural(sum.attendance.guards, 'guard')}; ${plural(sum.attendance.outside, 'check-in')} outside the geofence.`,
    `Patrols: ${sum.patrols.completed} of ${sum.patrols.total} completed${missedPatrols ? `; ${missedPatrols} not completed` : ''}.`,
    `Incidents: ${plural(sum.incidents.total, 'incident')}, ${sum.incidents.resolved} resolved, ${unresolved} open; ${sum.incidents.serious} high or critical.`,
    `Alerts: ${plural(sum.alerts.total, 'alert')}, ${sum.alerts.acknowledged} acknowledged, ${openAlerts} open.`,
    `Roster: ${plural(sum.guards.total, 'guard')} · ${plural(sum.sites.total, 'site')} · ${plural(sum.summary?.clients ?? 0, 'client')}.`,
  ]
}

function saveTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function ReportGlyph({ section }: { section: string }) {
  const Icon = section === 'attendance' ? Clock3 : section === 'patrols' ? Route : section === 'incidents' ? ShieldAlert : section === 'alerts' ? Bell : section === 'payroll' ? Wallet : section === 'guards' ? Users : section === 'sites' ? MapPin : section === 'clients' ? BriefcaseBusiness : FileText
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F2EC] text-[#3F3F46]"><Icon className="size-4" strokeWidth={1.75} /></span>
}

function VolumeChart({ summary }: { summary: Summary | null }) {
  const bars = summary ? [
    { label: 'Check-ins', value: summary.attendance.total, tone: 'bg-[#2A2B2E]' },
    { label: 'Patrols', value: summary.patrols.total, tone: 'bg-[#4C6352]' },
    { label: 'Incidents', value: summary.incidents.total, tone: 'bg-[#B7791F]' },
    { label: 'Alerts', value: summary.alerts.total, tone: 'bg-[#B42318]' },
  ] : []
  const max = Math.max(1, ...bars.map((bar) => bar.value))
  return <section className="ws-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">Report volume</h2>
        <p className="mt-0.5 text-[11px] text-[#6B6B72]">Operational records captured in this period</p>
      </div>
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-[#F0F2EC] text-[#3F3F46]"><Activity className="size-4" strokeWidth={1.75} /></span>
    </div>
    {!summary ? <div className="mt-4 h-[180px] animate-pulse rounded-[8px] bg-[#F5F5F6]" /> : <div className="mt-4 flex h-[180px] items-end gap-3 border-b border-[#E4E4E7] px-1 sm:gap-6">
      {bars.map((bar) => <div key={bar.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
        <span className="text-[10px] font-semibold tabular-nums text-[#52525B]">{bar.value}</span>
        <div className={`w-full max-w-[84px] rounded-t-[5px] ${bar.tone}`} style={{ height: `${Math.max(4, (bar.value / max) * 100)}%` }} />
        <span className="pb-2 text-[10px] text-[#6B6B72]">{bar.label}</span>
      </div>)}
    </div>}
  </section>
}

function Breakdown({ section, title, total, leftLabel, left, rightLabel, right, rightTone = 'bg-[#B42318]', note, loading }: {
  section: string; title: string; total: number; leftLabel: string; left: number; rightLabel: string; right: number; rightTone?: string; note?: string; loading?: boolean
}) {
  const leftPct = total ? Math.round((left / total) * 100) : 0
  return <section className="ws-card p-4">
    <div className="flex items-start justify-between gap-3"><ReportGlyph section={section} />{loading ? <Skeleton className="h-5 w-8" /> : <span className="text-[18px] font-semibold tabular-nums text-[#18181B]">{total}</span>}</div>
    <h2 className="mt-3 text-[12.5px] font-semibold text-[#18181B]">{title}</h2>
    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[#F0F0F0]">{loading ? <div className="h-full w-full animate-pulse bg-[#E4E4E7]" /> : <><div className="bg-[#16794A]" style={{ width: `${leftPct}%` }} /><div className={`flex-1 ${rightTone}`} /></>}</div>
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#6B6B72]">
      <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#16794A]" />{leftLabel} <b className="font-semibold tabular-nums text-[#3F3F46]">{left}</b></span>
      <span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${rightTone}`} />{rightLabel} <b className="font-semibold tabular-nums text-[#3F3F46]">{right}</b></span>
    </div>
    {note && <p className="mt-2 text-[10px] leading-4 text-[#8A938B]">{note}</p>}
  </section>
}

export function ReportsPage() {
  const monthStart = lagosDay().slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart); const [to, setTo] = useState(lagosDay()); const [sum, setSum] = useState<Summary | null>(null); const [problem, setProblem] = useState('')
  const loadSummary = useCallback(async () => {
    setSum(null)
    try {
      const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to)
      setSum(await api<Summary>(`/api/reports?${q}`)); setProblem('')
    } catch (issue) { setProblem(issue instanceof Error ? issue.message : 'Unable to load the summary.') }
  }, [from, to])
  useEffect(() => { void loadSummary() }, [loadSummary])
  const presets: [string, () => void][] = [['Today', () => { setFrom(lagosDay()); setTo(lagosDay()) }], ['Last 7 days', () => { setFrom(lagosDay(-6)); setTo(lagosDay()) }], ['This month', () => { setFrom(monthStart); setTo(lagosDay()) }], ['Last month', () => { const d = new Date(`${monthStart}T00:00:00Z`); const prevEnd = new Date(d.getTime() - 86400000); setFrom(prevEnd.toISOString().slice(0, 8) + '01'); setTo(prevEnd.toISOString().slice(0, 10)) }], ['All time', () => { setFrom(''); setTo('') }]]
  const qs = `${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`
  const cards: [string, string, string, string][] = [
    ['attendance', 'Attendance log', 'Guard, site, time, geofence result and review status.', sum ? plural(sum.attendance.total, 'check-in') : '…'],
    ['patrols', 'Patrol log', 'Each daily patrol with the guard, site and signed checkpoints.', sum ? plural(sum.patrols.total, 'patrol') : '…'],
    ['incidents', 'Incident register', 'Title, site, severity, status, assignee and timeline.', sum ? plural(sum.incidents.total, 'incident') : '…'],
    ['alerts', 'Alerts', 'Every alert raised, its severity and acknowledgement.', sum ? plural(sum.alerts.total, 'alert') : '…'],
    ['payroll', 'Payroll', 'Base pay, attendance days, deductions, net pay and status.', sum && sum.payroll.total !== null ? plural(sum.payroll.total, 'record') : '…'],
    ['guards', 'Guard roster', 'Guards in the period, with site, salary and NFC tag.', sum ? plural(sum.guards.total, 'guard') : '…'],
    ['sites', 'Sites', 'Sites in the period with geofence and client.', sum ? plural(sum.sites.total, 'site') : '…'],
    ['clients', 'Clients', 'Client accounts with contract value and renewal date.', sum ? plural(sum.summary?.clients ?? 0, 'client') : '…'],
    ...(FINANCE_ENABLED ? [['finances', 'Finance ledger', 'Invoices, expenses, budgets and inventory with client and site.', sum ? (sum.summary?.finance ? 'Revenue and costs' : 'Not available for your role') : '…'] as [string, string, string, string]] : []),
  ]
  function downloadSummary() {
    if (!sum) return
    const lines = [
      'BastionOS — Report',
      `Period: ${periodLabel(from, to)}`,
      `Generated: ${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}`,
      '',
      ...reportLines(sum).map((line) => `• ${line}`),
    ]
    saveTextFile(`bastion-report-${from || 'all'}-${to || 'now'}.txt`, lines.join('\n'))
  }
  return <>
    <PageHeader title="Reports" subtitle="See the period at a glance, inspect the charts and download the records behind them.">
      <button onClick={downloadSummary} disabled={!sum} className={btnPrimary}><Download className="size-3.5" />Download report</button>
    </PageHeader>
    <ErrorBanner message={problem} retry={() => void loadSummary()} />
    <section className="mb-4 ws-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3"><Field label="From"><input type="date" className={`${inputClass.replace('w-full', 'w-auto')}`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={`${inputClass.replace('w-full', 'w-auto')}`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field></div>
        <div className="flex flex-wrap gap-1.5">{presets.map(([label, fn]) => <button key={label} className="rounded-full border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#52525B] hover:border-[#D4D4D8]" onClick={fn}>{label}</button>)}</div>
      </div>
      <p className="mt-2 text-[11px] text-[#6B6B72]">{from || to ? `Showing ${from || 'the beginning'} to ${to || 'today'} (Lagos dates).` : 'Showing all time.'}</p>
    </section>

    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="col-span-2 xl:col-span-4"><VolumeChart summary={sum} /></div>
      <Breakdown loading={!sum} section="attendance" title="Attendance" total={sum?.attendance.total ?? 0} leftLabel="Inside geofence" left={sum ? sum.attendance.total - sum.attendance.outside : 0} rightLabel="Outside" right={sum?.attendance.outside ?? 0} />
      <Breakdown loading={!sum} section="patrols" title="Patrol completion" total={sum?.patrols.total ?? 0} leftLabel="Completed" left={sum?.patrols.completed ?? 0} rightLabel="Not completed" right={sum ? sum.patrols.total - sum.patrols.completed : 0} rightTone="bg-[#B7791F]" />
      <Breakdown loading={!sum} section="incidents" title="Incidents" total={sum?.incidents.total ?? 0} leftLabel="Resolved" left={sum?.incidents.resolved ?? 0} rightLabel="Open" right={sum ? sum.incidents.total - sum.incidents.resolved : 0} rightTone="bg-[#B7791F]" note={sum ? `${sum.incidents.serious} high or critical` : undefined} />
      <Breakdown loading={!sum} section="alerts" title="Alerts" total={sum?.alerts.total ?? 0} leftLabel="Acknowledged" left={sum?.alerts.acknowledged ?? 0} rightLabel="Open" right={sum ? sum.alerts.total - sum.alerts.acknowledged : 0} />
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([key, title, text, count]) => <section key={key} className="flex flex-col ws-card p-4">
      <div className="flex items-start justify-between gap-3"><ReportGlyph section={key} /><span className="rounded-full bg-[#F5F5F6] px-2 py-0.5 text-[10px] font-medium text-[#52525B]">{count}</span></div>
      <h2 className="mt-3 text-[13px] font-semibold tracking-[-0.01em] text-[#18181B]">{title}</h2>
      <p className="mt-1 flex-1 text-[11px] leading-4 text-[#6B6B72]">{text}</p>
      <a href={`/api/export?section=${key}${qs}`} className={`${smallBtn} mt-3 self-start`}><Download className="size-3" />Download CSV</a>
    </section>)}</div>
  </>
}

type Member = { id: string; userId: string; role: string; createdAt: string; name: string; email: string; image: string | null; guardId: string | null; guardName: string | null; lastActive: string | null }
type TeamData = { me: string; myRole: string; canManage: boolean; members: Member[] }
type Matrix = { matrix: Record<string, Record<string, boolean>>; canEdit: boolean }

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#2A2B2E]' : 'bg-zinc-300'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button>
}

export function SettingsPage() {
  const [tab, setTab] = useState<'organisation' | 'operations' | 'team' | 'roles' | 'account'>('organisation')
  const [team, setTeam] = useState<TeamData | null>(null); const [matrix, setMatrix] = useState<Matrix | null>(null); const [problem, setProblem] = useState('')
  const [editing, setEditing] = useState<Member | 'new' | null>(null); const [viewing, setViewing] = useState<Member | null>(null)
  const refreshTeam = useCallback(async () => { try { const [t, m] = await Promise.all([api<TeamData>('/api/team'), api<Matrix>('/api/permissions')]); setTeam(t); setMatrix(m); setProblem('') } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to load your team.') } }, [])

  async function flip(role: string, permission: string) {
    if (!matrix) return; const next = !matrix.matrix[role][permission]
    setMatrix({ ...matrix, matrix: { ...matrix.matrix, [role]: { ...matrix.matrix[role], [permission]: next } } })
    try { await api('/api/permissions', { method: 'PATCH', json: { role, permission, allowed: next } }); setProblem('') } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to save.'); void refreshTeam() }
  }
  const tabs = [['organisation', 'Organisation'], ['operations', 'Operations'], ['account', 'Account']] as const
  return <>
    <PageHeader title="Settings" subtitle="Company details, operational defaults and your account."></PageHeader>
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
    <nav className="grid grid-cols-2 gap-1 sm:flex sm:overflow-x-auto lg:sticky lg:top-[84px] lg:flex-col lg:self-start">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`min-h-[44px] min-w-0 rounded-[10px] px-3 py-2 text-left text-[12px] leading-tight sm:whitespace-nowrap lg:px-4 lg:text-[13px] ${tab === key ? 'bg-white font-semibold shadow-sm' : 'text-[#52525B] hover:bg-white/60'}`}>{label}</button>)}</nav>
    <div className="min-w-0">
    <ErrorBanner message={problem} retry={() => void refreshTeam()} />
    {tab === 'organisation' && <OrgSettings />}
    {tab === 'operations' && <GuardAppSettings />}
    {tab === 'account' && <AccountSettings />}
    {tab === 'team' && <section className="overflow-hidden ws-card">
      {!team ? <Spinner /> : <ul className="divide-y divide-[#EFEFF1]">{team.members.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-3 p-4 text-xs"><button onClick={() => setViewing(m)} aria-label={`Open ${m.name}'s profile`} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Avatar name={m.name} src={m.image} size={36} /><span className="min-w-0 flex-1"><b className="block truncate text-[13px] font-semibold">{m.name}{m.userId === team.me && <span className="ml-1.5 font-normal text-[#6B6B72]">(you)</span>}</b><span className="block truncate text-[#6B6B72]">{m.email}</span></span></button><Badge value={ROLE_LABELS[m.role] ?? m.role} />{team.canManage && <button className={smallBtn} onClick={() => setEditing(m)}>Edit</button>}</li>)}</ul>}
      {team && !team.canManage && <p className="border-t border-[#EBEFE7] p-4 text-[11px] text-[#6B6B72]">Only the owner or an administrator can add or edit people.</p>}
    </section>}
    {tab === 'roles' && <section className="overflow-hidden ws-card">
      {!matrix ? <Spinner /> : <><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-[#F5F5F6] text-[10px] tracking-wide text-[#6B6B72]"><tr><th className="px-4 py-3">PERMISSION</th>{['owner', ...EDITABLE_ROLES, 'guard'].map((r) => <th key={r} className="px-3 py-3 text-center">{ROLE_LABELS[r].toUpperCase()}</th>)}</tr></thead>
        <tbody>{PERMISSIONS.map((p) => <tr key={p.key} className="border-t border-[#EBEFE7]"><td className="px-4 py-3 font-semibold">{p.label}</td>{['owner', ...EDITABLE_ROLES, 'guard'].map((r) => { const locked = r === 'owner' || r === 'guard' || r === 'admin' || !matrix.canEdit; return <td key={r} className="px-3 py-3 text-center"><span className="inline-flex"><Switch on={matrix.matrix[r][p.key]} label={`${ROLE_LABELS[r]}: ${p.label}`} disabled={locked} onChange={() => void flip(r, p.key)} /></span></td> })}</tr>)}</tbody></table></div>
        <p className="border-t border-[#EBEFE7] p-4 text-[11px] text-[#6B6B72]">Owner and Administrator always keep every permission. Guards use only the guard app (scan, patrol checkpoints, SOS) and cannot open the rest of the system.{!matrix.canEdit && ' Only the owner or an administrator can change these switches.'}</p></>}
    </section>}
    </div></div>
    {viewing && team && <ProfileSheet member={viewing} canManage={team.canManage} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null) }} />}
    {editing && team && <UserSheet member={editing === 'new' ? null : editing} team={team} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refreshTeam() }} />}
  </>
}


function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_280px] sm:items-center sm:gap-6">
    <div><p className="text-[12.5px] font-medium text-[#18181B]">{label}</p>{hint && <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B6B72]">{hint}</p>}</div>
    <div>{children}</div>
  </div>
}

function OrgSettings() {
  const [d, setD] = useState<{ name: string; settings: { phone: string; address: string; defaultGeofence: number; defaultSalary: number }; canEdit: boolean } | null>(null)
  const [v, setV] = useState({ name: '', phone: '', address: '', defaultGeofence: '100', defaultSalary: '150000' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false); const [emailNote, setEmailNote] = useState(''); const [emailError, setEmailError] = useState('')
  useEffect(() => { api<NonNullable<typeof d>>('/api/settings').then((r) => { setD(r); setV({ name: r.name, phone: r.settings.phone, address: r.settings.address, defaultGeofence: String(r.settings.defaultGeofence), defaultSalary: String(r.settings.defaultSalary) }) }).catch((e) => setErr(e instanceof Error ? e.message : 'Unable to load settings.')) }, [])
  async function save(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); setMsg(''); try { await api('/api/settings', { method: 'PATCH', json: v }); setMsg('Saved. The company name updates in the sidebar the next time the page loads.') } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to save.') } finally { setBusy(false) } }
  async function testEmail() { setTestingEmail(true); setEmailNote(''); setEmailError(''); try { const result = await api<{ sent: boolean; transport: string; reason?: string }>('/api/settings/test-email', { method: 'POST' }); if (!result.sent) throw new Error(result.reason ?? 'Email was not delivered.'); setEmailNote(`Test email sent by ${result.transport}. Check the administrator inbox.`) } catch (issue) { setEmailError(issue instanceof Error ? issue.message : 'Could not send the test email.') } finally { setTestingEmail(false) } }
  if (!d && !err) return <section className="ws-card"><Spinner /></section>
  const off = !d?.canEdit

  return <form onSubmit={save} className="grid gap-4">
    <ErrorBanner message={err} />

    <section className="ws-card">
      <header className="border-b border-[#E4E4E7] px-5 py-4"><h2 className="text-[14px] font-semibold tracking-[-0.01em]">Company profile</h2><p className="mt-0.5 text-xs text-[#6B6B72]">How your company appears in the sidebar, on exports and in emails.</p></header>
      <div className="divide-y divide-[#EFEFF1]">
        <SettingRow label="Company name" hint="Shown to your team and on every export."><input required minLength={2} disabled={off} className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></SettingRow>
        <SettingRow label="Phone" hint="A number your team can reach operations on."><input disabled={off} className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></SettingRow>
        <SettingRow label="Office address" hint="Used on reports and client records."><input disabled={off} className={inputClass} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></SettingRow>
      </div>
    </section>

    <section className="ws-card">
      <header className="border-b border-[#E4E4E7] px-5 py-4"><h2 className="text-[14px] font-semibold tracking-[-0.01em]">Defaults for new records</h2><p className="mt-0.5 text-xs text-[#6B6B72]">These pre-fill new guards and sites. Existing records stay as they are.</p></header>
      <div className="divide-y divide-[#EFEFF1]">
        <SettingRow label="Site geofence" hint="Check-ins outside this radius are flagged for review."><div className="flex items-center gap-2"><input type="number" min={10} max={5000} disabled={off} className={inputClass} value={v.defaultGeofence} onChange={(e) => setV({ ...v, defaultGeofence: e.target.value })} /><span className="text-xs text-[#6B6B72]">metres</span></div></SettingRow>
        <SettingRow label="Guard salary" hint="Monthly base pay used when a guard is registered."><div className="flex items-center gap-2"><span className="text-xs text-[#6B6B72]">₦</span><input type="number" min={0} disabled={off} className={inputClass} value={v.defaultSalary} onChange={(e) => setV({ ...v, defaultSalary: e.target.value })} /></div></SettingRow>
      </div>
    </section>

    <div className="flex flex-wrap items-center gap-3">
      <button className={btnPrimary} disabled={busy || off}>{busy ? 'Saving…' : 'Save changes'}</button>
      {off && <span className="text-[11px] text-[#6B6B72]">Only the owner or an administrator can change these.</span>}
      {msg && <span role="status" className="text-xs text-[#16794A]">{msg}</span>}
    </div>

    <section className="ws-card">
      <header className="border-b border-[#E4E4E7] px-5 py-4"><h2 className="text-[14px] font-semibold tracking-[-0.01em]">Email notifications</h2><p className="mt-0.5 text-xs text-[#6B6B72]">Alerts, new incidents and attendance exceptions are emailed to owners, administrators and moderators.</p></header>
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <p className="max-w-[52ch] text-[11px] leading-5 text-[#6B6B72]">Delivery uses Resend when <span className="font-mono text-[10.5px]">RESEND_API_KEY</span> and <span className="font-mono text-[10.5px]">MAIL_FROM</span> are configured. Send a test to your own account to verify the setup.</p>
        <button type="button" onClick={() => void testEmail()} disabled={testingEmail || off} className={btn}><Mail className="size-3.5" />{testingEmail ? 'Sending…' : 'Send test email'}</button>
      </div>
      {emailNote && <p role="status" className="border-t border-[#EFEFF1] px-5 py-3 text-[11px] text-[#16794A]">{emailNote}</p>}
      {emailError && <p role="alert" className="border-t border-[#EFEFF1] px-5 py-3 text-[11px] text-[#B42318]">{emailError}</p>}
    </section>
  </form>
}

function ProfileSheet({ member, canManage, onClose, onEdit }: { member: Member; canManage: boolean; onClose: () => void; onEdit: () => void }) {
  const rows: [string, string][] = [['Email', member.email], ['Role', ROLE_LABELS[member.role] ?? member.role], ['Joined', when(member.createdAt)], ['Last active', member.lastActive ? when(member.lastActive) : 'Not signed in yet'], ...(member.role === 'guard' ? [['Linked guard', member.guardName ?? 'Not linked to a guard record'] as [string, string]] : [])]
  return <Sheet title={member.name} kicker="PROFILE" onClose={onClose} footer={canManage ? <button className={btnPrimary} onClick={onEdit}>Edit user</button> : undefined}>
    <div className="mb-5 flex items-center gap-4"><Avatar name={member.name} src={member.image} size={72} /><div><p className="text-lg font-medium">{member.name}</p><Badge value={ROLE_LABELS[member.role] ?? member.role} /></div></div>
    <dl className="divide-y divide-[#EFEFF1] text-sm">{rows.map(([k, val]) => <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-[#6B6B72]">{k}</dt><dd className="text-right font-medium">{val}</dd></div>)}</dl>
  </Sheet>
}

function UserSheet({ member, team, onClose, onSaved }: { member: Member | null; team: TeamData; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? ''); const [email, setEmail] = useState(member?.email ?? ''); const [password, setPassword] = useState(''); const [role, setRole] = useState(member?.role ?? 'member')
  const [guardId, setGuardId] = useState(member?.guardId ?? ''); const [guardList, setGuardList] = useState<Row[]>([])
  useEffect(() => { api<Row[]>('/api/operations?section=guards').then(setGuardList).catch(() => undefined) }, [])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ emailed: boolean; email: string; reason?: string } | null>(null)
  const isOwnerRow = member?.role === 'owner'; const isSelf = member?.userId === team.me
  const roleLocked = isOwnerRow || isSelf
  async function submit(event: FormEvent) {
    event.preventDefault(); setErr(''); setBusy(true)
    try {
      if (!member) {
        const result = await api<{ emailed: boolean; emailReason?: string }>('/api/team', { method: 'POST', json: { name, email, role, ...(role === 'guard' && guardId ? { guardId } : {}), ...(password ? { password } : {}) } })
        setCreated({ emailed: result.emailed, email, reason: result.emailReason })
        return
      }
      await api('/api/team', { method: 'PATCH', json: { memberId: member.id, name, email, ...(roleLocked ? {} : { role }), ...((roleLocked ? member?.role : role) === 'guard' ? { guardId: guardId || null } : {}), ...(password ? { password } : {}) } })
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to save.') } finally { setBusy(false) }
  }
  async function remove() {
    if (!member || !window.confirm(`Remove ${member.name} from your team?`)) return
    setBusy(true); try { await api(`/api/team?memberId=${member.id}`, { method: 'DELETE' }); onSaved() } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to remove.') } finally { setBusy(false) }
  }
  const roleOptions = ASSIGNABLE_ROLES.filter((r) => r !== 'admin' || team.myRole === 'owner' || member?.role === 'admin')
  if (created) {
    return <Sheet title="Account created" kicker="TEAM" onClose={onSaved} footer={<button type="button" className={btnPrimary} onClick={onSaved}>Done</button>}>
      <p className="text-sm leading-relaxed text-[#3F3F46]">
        {created.emailed
          ? <>Login details were emailed to <b className="font-semibold">{created.email}</b> with a temporary password.</>
          : <>The account for <b className="font-semibold">{created.email}</b> is ready, but email is not configured. Share the temporary password with them securely.</>}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-[#6B6B72]">They can change the password after signing in from <b className="font-semibold">Profile → Change password</b>.</p>
      {!created.emailed && created.reason && <p className="mt-3 rounded-lg border border-[#F3E3BF] bg-[#FEF3E2] p-3 text-[11px] text-[#8A6413]">{created.reason}</p>}
    </Sheet>
  }
  return <Sheet title={member ? 'Edit user' : 'Add user'} kicker="TEAM" onClose={onClose} footer={<>{member && !isOwnerRow && !isSelf && <button type="button" className={`${btn} mr-auto text-[#B42318]`} onClick={() => void remove()} disabled={busy}>Remove</button>}<button type="button" className={btn} onClick={onClose}>Cancel</button><button form="user-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
    <form id="user-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={err} />
      <Field label="Full name"><input required minLength={2} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Role"><select className={inputClass} value={role} disabled={roleLocked} onChange={(e) => setRole(e.target.value)}>{isOwnerRow && <option value="owner">Owner</option>}{roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}{r === 'guard' ? ' (guard app only)' : ''}</option>)}</select></Field>
      {role === 'guard' && <Field label="Guard record" hint="Links this login to the guard, so the guard app knows who is using it and only accepts that guard’s tag"><select className={inputClass} value={guardId} onChange={(e) => setGuardId(e.target.value)}><option value="">Not linked yet</option>{guardList.map((g) => <option key={g.id} value={g.id}>{g.name}{g.site ? ` · ${g.site}` : ''}</option>)}</select></Field>}
      {roleLocked && <p className="text-[11px] text-[#6B6B72]">{isOwnerRow ? 'The owner role cannot be changed.' : 'You cannot change your own role.'}</p>}
      <Field label={member ? 'New password (leave empty to keep)' : 'Temporary password'}><input type="password" minLength={8} required={!member} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    </form></Sheet>
}
