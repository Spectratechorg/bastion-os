'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, Plus, RefreshCw, Search } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'

type ClientRecord = {
  id: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  status: string
  monthlyValue: number
  slaScore: number | null
  renewalDate: string | null
}

type FinanceRecord = {
  id: string
  kind: string
  label: string
  amount: number
  status: string
  dueDate: string | null
  notes: string | null
  createdAt: string
}

type WorkspaceData = {
  user: { name: string; email: string; role: string }
  organization: { name: string; slug: string }
  members: { id: string; name: string; email: string; role: string; joinedAt: string }[]
  activity: { id: string; title: string; body: string; type: string; createdAt: string }[]
}

type ReportData = {
  generatedAt: string
  periodStart: string
  summary: {
    guards: { total: number; active: number }
    sites: number
    incidents: { total: number; open: number }
    clients: number
    finance: { revenue: number; costs: number; pending: number }
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Unable to load workspace data.')
  return body as T
}

function ErrorNotice({ children }: { children: string }) {
  return <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{children}</p>
}

function EmptyState({ children, colSpan = 8 }: { children: string; colSpan?: number }) {
  return <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-xs text-zinc-500">{children}</td></tr>
}

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)

export function ClientsDataPage() {
  const [rows, setRows] = useState<ClientRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', monthlyValue: '', slaScore: '', renewalDate: '', status: 'active' })

  async function load() {
    setLoading(true)
    try {
      setRows(await jsonRequest<ClientRecord[]>('/api/clients'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load clients.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => rows.filter((row) => `${row.name} ${row.contactName ?? ''} ${row.email ?? ''} ${row.status}`.toLowerCase().includes(search.toLowerCase())), [rows, search])
  const active = rows.filter((row) => row.status === 'active').length
  const monthly = rows.reduce((sum, row) => sum + Number(row.monthlyValue), 0)
  const averageSla = rows.filter((row) => row.slaScore !== null).length
    ? rows.reduce((sum, row) => sum + Number(row.slaScore ?? 0), 0) / rows.filter((row) => row.slaScore !== null).length
    : null

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await jsonRequest<ClientRecord>('/api/clients', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...form, monthlyValue: Number(form.monthlyValue), slaScore: form.slaScore ? Number(form.slaScore) : '', renewalDate: form.renewalDate ? new Date(`${form.renewalDate}T00:00:00.000Z`).toISOString() : '' }),
      })
      setForm({ name: '', contactName: '', email: '', phone: '', monthlyValue: '', slaScore: '', renewalDate: '', status: 'active' })
      setEditingId(null)
      setOpen(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create client.')
    } finally {
      setSaving(false)
    }
  }

  function edit(row: ClientRecord) {
    setEditingId(row.id)
    setForm({
      name: row.name,
      contactName: row.contactName ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      monthlyValue: String(row.monthlyValue),
      slaScore: row.slaScore === null ? '' : String(row.slaScore),
      renewalDate: row.renewalDate ? new Date(row.renewalDate).toISOString().slice(0, 10) : '',
      status: row.status,
    })
    setOpen(true)
  }

  return <>
    <PageHeader title="Clients" subtitle="Manage your organization’s client accounts and contract performance.">
      <a href="/api/export?section=clients" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold"><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => { setEditingId(null); setOpen(!open) }} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-black px-3.5 text-xs font-semibold text-white"><Plus className="size-3.5" />Add client</button>
    </PageHeader>
    <StatStrip stats={[[String(rows.length), 'Clients'], [String(active), 'Active'], [money(monthly), 'Monthly contract value'], [averageSla === null ? '—' : `${averageSla.toFixed(1)}%`, 'Average SLA score']]} />
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {open && <form onSubmit={create} className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      {([
        ['name', 'Client name', 'text'],
        ['contactName', 'Contact name', 'text'],
        ['email', 'Contact email', 'email'],
        ['phone', 'Contact phone', 'tel'],
        ['monthlyValue', 'Monthly contract value (NGN)', 'number'],
        ['slaScore', 'SLA score (%)', 'number'],
        ['renewalDate', 'Contract renewal date', 'date'],
      ] as const).map(([key, label, type]) => <label key={key} className="flex flex-col gap-1.5 text-xs font-medium">{label}<input required={key === 'name' || key === 'monthlyValue'} min={type === 'number' ? '0' : undefined} max={key === 'slaScore' ? '100' : undefined} step={type === 'number' ? 'any' : undefined} type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3 text-sm" /></label>)}
      <label className="flex flex-col gap-1.5 text-xs font-medium">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-black px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update client' : 'Save client'}</button><button type="button" onClick={() => { setOpen(false); setEditingId(null) }} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs">Cancel</button></div>
    </form>}
    <div className="mb-3 flex items-center gap-2"><label className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3"><Search className="size-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients…" className="w-full text-xs outline-none" /></label><button onClick={() => void load()} aria-label="Refresh clients" className="rounded-lg border border-zinc-200 bg-white p-3"><RefreshCw className="size-3.5" /></button></div>
    <div className="overflow-x-auto rounded-[18px] border border-zinc-200 bg-white"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['CLIENT', 'CONTACT', 'EMAIL', 'PHONE', 'MONTHLY VALUE', 'SLA', 'RENEWAL', 'STATUS', ''].map((name, index) => <th key={`${name}-${index}`} className="px-4 py-3">{name}</th>)}</tr></thead><tbody>{loading ? <EmptyState colSpan={9}>Loading client records…</EmptyState> : filtered.length === 0 ? <EmptyState colSpan={9}>{search ? 'No clients match your search.' : 'No clients have been added to this organization yet.'}</EmptyState> : filtered.map((row) => <tr key={row.id} className="border-t border-zinc-100"><td className="px-4 py-3.5 font-semibold">{row.name}</td><td className="px-4 py-3.5">{row.contactName ?? '—'}</td><td className="px-4 py-3.5">{row.email ?? '—'}</td><td className="px-4 py-3.5">{row.phone ?? '—'}</td><td className="px-4 py-3.5">{money(Number(row.monthlyValue))}</td><td className="px-4 py-3.5">{row.slaScore === null ? '—' : `${row.slaScore}%`}</td><td className="px-4 py-3.5">{row.renewalDate ? new Date(row.renewalDate).toLocaleDateString() : '—'}</td><td className="px-4 py-3.5 capitalize">{row.status}</td><td className="px-4 py-3.5"><button onClick={() => edit(row)} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold">Edit</button></td></tr>)}</tbody></table></div>
  </>
}

const financeFilters: Record<string, string[] | null> = {
  overview: null,
  invoices: ['invoice'],
  payroll: ['payroll', 'salary'],
  expenses: ['operating_cost', 'expense'],
  inventory: ['inventory'],
  budgets: ['budget'],
  reports: null,
}

const defaultKind: Record<string, string> = {
  invoices: 'invoice', payroll: 'payroll', expenses: 'operating_cost',
  inventory: 'inventory', budgets: 'budget', reports: 'revenue', overview: 'revenue',
}

export function FinanceDataPage({ tab }: { tab: string }) {
  const [rows, setRows] = useState<FinanceRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ kind: defaultKind[tab] ?? 'revenue', label: '', amount: '', status: 'pending', dueDate: '', notes: '' })

  async function load() {
    setLoading(true)
    try {
      setRows(await jsonRequest<FinanceRecord[]>('/api/operations?section=finances'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load finance records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tab])
  const filter = financeFilters[tab] ?? null
  const filtered = useMemo(() => rows.filter((row) => (!filter || filter.includes(row.kind)) && `${row.label} ${row.kind} ${row.status} ${row.notes ?? ''}`.toLowerCase().includes(search.toLowerCase())), [rows, filter, search])
  const total = filtered.reduce((sum, row) => sum + Number(row.amount), 0)
  const pending = filtered.filter((row) => !['paid', 'settled'].includes(row.status.toLowerCase())).reduce((sum, row) => sum + Number(row.amount), 0)
  const title = tab === 'overview' ? 'Finance' : `${tab[0]?.toUpperCase()}${tab.slice(1)}`

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await jsonRequest<FinanceRecord>('/api/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: 'finances', ...form, amount: Number(form.amount), dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00.000Z`).toISOString() : '' }),
      })
      setForm({ kind: defaultKind[tab] ?? 'revenue', label: '', amount: '', status: 'pending', dueDate: '', notes: '' })
      setOpen(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save finance record.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader title={title} subtitle="Financial records and summaries from your organization database.">
      <a href="/api/export?section=finances" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold"><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => setOpen(!open)} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-black px-3.5 text-xs font-semibold text-white"><Plus className="size-3.5" />Add record</button>
    </PageHeader>
    <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-zinc-200 text-xs">{Object.keys(financeFilters).map((item) => <a key={item} href={item === 'overview' ? '/finance' : `/finance/${item}`} className={`border-b-2 pb-3 capitalize ${item === tab ? 'border-black font-semibold' : 'border-transparent text-zinc-500'}`}>{item}</a>)}</nav>
    <StatStrip stats={[[String(filtered.length), 'Records'], [money(total), 'Total value'], [money(pending), 'Unsettled value'], [loading ? '…' : 'Live', 'Database status']]} />
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {open && <form onSubmit={create} className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1.5 text-xs font-medium">Record type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3">{['revenue', 'invoice', 'payroll', 'operating_cost', 'expense', 'inventory', 'budget'].map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Description<input required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Amount (NGN)<input required min="0" step="any" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Status<input required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Due date<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-black px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save record'}</button><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs">Cancel</button></div>
    </form>}
    <div className="mb-3 flex items-center gap-2"><label className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3"><Search className="size-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="w-full text-xs outline-none" /></label><button onClick={() => void load()} aria-label="Refresh finance records" className="rounded-lg border border-zinc-200 bg-white p-3"><RefreshCw className="size-3.5" /></button></div>
    <div className="overflow-x-auto rounded-[18px] border border-zinc-200 bg-white"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['TYPE', 'DESCRIPTION', 'AMOUNT', 'STATUS', 'DUE DATE', 'NOTES'].map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead><tbody>{loading ? <EmptyState>Loading finance records…</EmptyState> : filtered.length === 0 ? <EmptyState>{search ? 'No records match your search.' : 'No finance records in this category yet.'}</EmptyState> : filtered.map((row) => <tr key={row.id} className="border-t border-zinc-100"><td className="px-4 py-3.5 capitalize">{row.kind.replaceAll('_', ' ')}</td><td className="px-4 py-3.5 font-semibold">{row.label}</td><td className="px-4 py-3.5">{money(Number(row.amount))}</td><td className="px-4 py-3.5 capitalize">{row.status}</td><td className="px-4 py-3.5">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</td><td className="px-4 py-3.5">{row.notes ?? '—'}</td></tr>)}</tbody></table></div>
  </>
}

export function ReportsDataPage() {
  const [report, setReport] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setReport(await jsonRequest<ReportData>('/api/reports'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate live reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  const summary = report?.summary
  const reports = [
    { title: 'Guard workforce', details: `${summary?.guards.active ?? 0} active of ${summary?.guards.total ?? 0} registered`, href: '/api/export?section=guards' },
    { title: 'Site register', details: `${summary?.sites ?? 0} sites`, href: '/api/export?section=sites' },
    { title: 'Incident review', details: `${summary?.incidents.open ?? 0} open of ${summary?.incidents.total ?? 0} incidents`, href: '/api/export?section=incidents' },
    { title: 'Client accounts', details: `${summary?.clients ?? 0} client accounts`, href: '/api/export?section=clients' },
    { title: 'Finance ledger', details: `${money(summary?.finance.revenue ?? 0)} revenue · ${money(summary?.finance.costs ?? 0)} costs`, href: '/api/export?section=finances' },
  ]

  return <>
    <PageHeader title="Reports" subtitle="Live organization summaries and exports from persisted records.">
      <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold"><RefreshCw className="size-3.5" />Refresh reports</button>
    </PageHeader>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <StatStrip stats={[[String(summary?.guards.total ?? (loading ? '…' : 0)), 'Registered guards'], [String(summary?.sites ?? (loading ? '…' : 0)), 'Sites'], [String(summary?.incidents.open ?? (loading ? '…' : 0)), 'Open incidents'], [money(summary?.finance.pending ?? 0), 'Unsettled finance']]} />
    <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white"><header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Available reports</h2><p className="mt-1 text-xs text-zinc-500">{report ? `Generated ${new Date(report.generatedAt).toLocaleString()} · year-to-date from ${new Date(report.periodStart).toLocaleDateString()}` : 'Summary data is loaded from your active organization.'}</p></header><div className="divide-y divide-zinc-100">{reports.map((item) => <div key={item.title} className="flex flex-wrap items-center gap-3 px-4 py-4"><div className="min-w-0 flex-1"><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-1 text-[11px] text-zinc-500">{item.details}</p></div><a href={item.href} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold"><Download className="size-3.5" />Download CSV</a></div>)}</div></section>
  </>
}

export function SettingsDataPage() {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardCode, setGuardCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeNote, setCodeNote] = useState('')
  const [rotating, setRotating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setData(await jsonRequest<WorkspaceData>('/api/workspace'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load organization settings.')
    } finally {
      setLoading(false)
    }
  }

  async function loadGuardCode() {
    try {
      const response = await fetch('/api/guard/access', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load the guard app code.')
      setGuardCode(payload.code ?? '')
      setCodeError('')
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : 'Unable to load the guard app code.')
    }
  }

  async function rotateGuardCode() {
    if (!window.confirm('Replace the guard app code? Every phone using the old code will stop working.')) return
    setRotating(true)
    try {
      const response = await fetch('/api/guard/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to replace the code.')
      setGuardCode(payload.code ?? '')
      setCodeError('')
      setCodeNote('New code created. Give it to your supervisors.')
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : 'Unable to replace the code.')
    } finally {
      setRotating(false)
    }
  }

  useEffect(() => { void load(); void loadGuardCode() }, [])

  return <>
    <PageHeader title="Settings" subtitle="Organization, team access, and recorded workspace activity.">
      <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold"><RefreshCw className="size-3.5" />Refresh</button>
    </PageHeader>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {loading && !data ? <p className="rounded-xl border border-zinc-200 bg-white p-6 text-xs text-zinc-500">Loading your organization settings…</p> : data && <>
      <section className="mb-5 rounded-[18px] border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Organization</h2>
        <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-3"><div><dt className="text-zinc-500">Name</dt><dd className="mt-1 font-semibold">{data.organization.name}</dd></div><div><dt className="text-zinc-500">Organization ID</dt><dd className="mt-1 font-mono">{data.organization.slug}</dd></div><div><dt className="text-zinc-500">Your access</dt><dd className="mt-1 capitalize font-semibold">{data.user.role}</dd></div></dl>
      </section>
      <section className="mb-5 rounded-[18px] border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Guard app access</h2>
        <p className="mt-1 text-xs text-zinc-500">Guard phones enter this code once at <span className="font-mono">/guard-app</span>, so nobody needs a manager login on the phone.</p>
        {codeError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{codeError}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm font-semibold tracking-wider">{guardCode || '—'}</code>
          <button onClick={() => guardCode && void navigator.clipboard.writeText(guardCode)} disabled={!guardCode} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold disabled:opacity-60">Copy code</button>
          <button onClick={() => void rotateGuardCode()} disabled={rotating} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2A2B2E] px-3 text-xs font-semibold text-white disabled:opacity-60">{rotating ? 'Replacing…' : 'Replace code'}</button>
        </div>
        {codeNote && <p role="status" className="mt-3 text-xs text-emerald-700">{codeNote}</p>}
      </section>
      <section className="mb-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Organization members</h2><p className="mt-1 text-xs text-zinc-500">Membership and roles currently stored for this organization.</p></header>
        <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] text-zinc-500"><tr>{['NAME', 'EMAIL', 'ROLE', 'JOINED'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.members.length ? data.members.map((member) => <tr key={member.id} className="border-t border-zinc-100"><td className="px-4 py-3.5 font-semibold">{member.name}</td><td className="px-4 py-3.5">{member.email}</td><td className="px-4 py-3.5 capitalize">{member.role}</td><td className="px-4 py-3.5">{new Date(member.joinedAt).toLocaleDateString()}</td></tr>) : <EmptyState colSpan={4}>No members are recorded for this organization.</EmptyState>}</tbody></table></div>
      </section>
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Recent recorded activity</h2><p className="mt-1 text-xs text-zinc-500">Events written by the operations API; this is not a complete security audit log.</p></header>
        <div className="divide-y divide-zinc-100">{data.activity.length ? data.activity.map((event) => <article key={event.id} className="flex flex-wrap gap-2 px-4 py-3.5"><div className="min-w-0 flex-1"><h3 className="text-xs font-semibold">{event.title}</h3><p className="mt-1 text-[11px] text-zinc-500">{event.body} <span className="ml-1">({event.type})</span></p></div><time className="text-[10px] text-zinc-400">{new Date(event.createdAt).toLocaleString()}</time></article>) : <p className="px-4 py-10 text-center text-xs text-zinc-500">No activity has been recorded yet.</p>}</div>
      </section>
    </>}
  </>
}
