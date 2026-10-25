'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, Plus, RefreshCw, Search } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { photoToDataUrl } from '@/lib/client'
import { ContractSummary, FinanceTabs, InventoryTab } from '@/components/finance-extra'

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
  sites?: { id: string; name: string; status: string }[]
  guardCount?: number
}

type FinanceRecord = {
  id: string
  kind: string
  label: string
  amount: number
  status: string
  dueDate: string | null
  notes: string | null
  clientId: string | null
  siteId: string | null
  category: string | null
  receiptUrl: string | null
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

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)

const financeFilters: Record<string, string[] | null> = {
  overview: null,
  invoices: ['invoice'],
  expenses: ['operating_cost', 'expense'],
  inventory: ['inventory'],
  budgets: ['budget'],
}

const defaultKind: Record<string, string> = {
  invoices: 'invoice', expenses: 'operating_cost',
  inventory: 'inventory', budgets: 'budget', overview: 'revenue',
}

const moneyIn = ['revenue', 'invoice']
const settledStatuses = ['paid', 'settled', 'received']
const expenseCategories = ['Fuel', 'Repairs & maintenance', 'Uniforms & kit', 'Equipment', 'Transport', 'Utilities', 'Training', 'Salary advance', 'Other']

type SiteRow = { id: string; name: string; clientName: string | null }

export function FinanceDataPage({ tab }: { tab: string }) {
  const page = tab in financeFilters ? tab : 'overview'
  const [rows, setRows] = useState<FinanceRecord[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const emptyForm = (kind: string) => ({ kind, label: '', amount: '', status: 'pending', dueDate: '', notes: '', clientId: '', siteId: '', category: '', receiptUrl: '' })
  const [form, setForm] = useState(emptyForm(defaultKind[page] ?? 'revenue'))

  async function load() {
    setLoading(true)
    try {
      const [records, clientRows, siteRows] = await Promise.all([
        jsonRequest<FinanceRecord[]>('/api/operations?section=finances'),
        jsonRequest<ClientRecord[]>('/api/clients').catch(() => []),
        jsonRequest<SiteRow[]>('/api/operations?section=sites').catch(() => []),
      ])
      setRows(records)
      setClients(clientRows)
      setSites(siteRows)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load finance records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [page])
  const clientName = (id: string | null) => clients.find((client) => client.id === id)?.name ?? null
  const siteName = (id: string | null) => sites.find((site) => site.id === id)?.name ?? null
  const filter = financeFilters[page] ?? null
  const filtered = useMemo(() => rows.filter((row) => (!filter || filter.includes(row.kind)) && `${row.label} ${row.kind} ${row.status} ${row.notes ?? ''}`.toLowerCase().includes(search.toLowerCase())), [rows, filter, search])
  const inflow = filtered.filter((row) => moneyIn.includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const outflow = filtered.filter((row) => !moneyIn.includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const unsettled = filtered.filter((row) => !settledStatuses.includes(row.status.toLowerCase())).reduce((sum, row) => sum + Number(row.amount), 0)
  const title = page === 'overview' ? 'Finance' : `${page[0]?.toUpperCase()}${page.slice(1)}`
  const [statementMonth, setStatementMonth] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7))
  const statement = useMemo(() => {
    const monthRows = rows.filter((row) => (row.dueDate ?? row.createdAt).slice(0, 7) === statementMonth)
    const groups = new Map<string, { name: string; income: number; cost: number }>()
    for (const row of monthRows) {
      const key = row.clientId ?? 'none'
      const entry = groups.get(key) ?? { name: clientName(row.clientId) ?? 'No client', income: 0, cost: 0 }
      if (moneyIn.includes(row.kind)) entry.income += Number(row.amount)
      else entry.cost += Number(row.amount)
      groups.set(key, entry)
    }
    const list = [...groups.values()].sort((a, b) => (b.income - b.cost) - (a.income - a.cost))
    return {
      income: list.reduce((sum, item) => sum + item.income, 0),
      cost: list.reduce((sum, item) => sum + item.cost, 0),
      list,
    }
  }, [rows, statementMonth, clients])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      section: 'finances',
      ...(editingId ? { id: editingId, action: 'update' } : {}),
      ...form,
      amount: Number(form.amount),
      dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00.000Z`).toISOString() : '',
      notes: form.notes || null,
    }
    try {
      await jsonRequest<FinanceRecord>('/api/operations', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setForm(emptyForm(defaultKind[page] ?? 'revenue'))
      setEditingId(null)
      setOpen(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save finance record.')
    } finally {
      setSaving(false)
    }
  }

  async function patch(row: FinanceRecord, action: 'settle' | 'reopen' | 'delete') {
    if (action === 'delete' && !window.confirm(`Delete “${row.label}”? This cannot be undone.`)) return
    setBusyId(row.id)
    setError('')
    try {
      await jsonRequest('/api/operations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: 'finances', id: row.id, action }),
      })
      if (action === 'delete') setRows((items) => items.filter((item) => item.id !== row.id))
      else setRows((items) => items.map((item) => item.id === row.id ? { ...item, status: action === 'settle' ? 'paid' : 'pending' } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the finance record.')
    } finally {
      setBusyId('')
    }
  }

  function edit(row: FinanceRecord) {
    setForm({
      kind: row.kind,
      label: row.label,
      amount: String(row.amount),
      status: row.status,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : '',
      notes: row.notes ?? '',
      clientId: row.clientId ?? '',
      siteId: row.siteId ?? '',
      category: row.category ?? '',
      receiptUrl: row.receiptUrl ?? '',
    })
    setEditingId(row.id)
    setOpen(true)
  }

  async function attachReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setForm((current) => ({ ...current, receiptUrl: '' }))
      const image = await photoToDataUrl(file, 900)
      setForm((current) => ({ ...current, receiptUrl: image }))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That receipt could not be read.')
    }
  }

  const clientLabel = (id: string | null) => clientName(id)
  const siteLabel = (id: string | null) => siteName(id)
  const isCost = !moneyIn.includes(form.kind)

  return <>
    <PageHeader title={title} subtitle="Income and costs recorded for your organization.">
      <a href="/api/export?section=finances" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold"><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => { setEditingId(null); setForm(emptyForm(defaultKind[page] ?? 'revenue')); setOpen(!open) }} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2A2B2E] px-3.5 text-xs font-semibold text-white"><Plus className="size-3.5" />Add record</button>
    </PageHeader>
    <FinanceTabs active={page} />
    {page === 'overview' && <ContractSummary />}
    {page === 'inventory' && <><h2 className="mb-2 text-sm font-semibold">Stock on hand</h2><InventoryTab /><h2 className="mb-2 mt-6 text-sm font-semibold">Inventory purchases and costs</h2></>}
    <StatStrip stats={[[String(filtered.length), 'Records'], [money(inflow), 'Money in'], [money(outflow), 'Money out'], [money(unsettled), 'Unsettled']]} />
    {page === 'overview' && <section className="mb-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4"><div><h2 className="text-sm font-semibold">Profit statement</h2><p className="mt-1 text-xs text-zinc-500">Income minus costs for the chosen month, grouped by client.</p></div><input type="month" aria-label="Statement month" value={statementMonth} onChange={(event) => event.target.value && setStatementMonth(event.target.value)} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs" /></header>
      <div className="grid grid-cols-3 divide-x divide-[#E4E4E7] border-b border-zinc-100 text-center">
        <div className="p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-500">Income</p><p className="mt-1 font-mono text-sm font-semibold text-emerald-700">{money(statement.income)}</p></div>
        <div className="p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-500">Costs</p><p className="mt-1 font-mono text-sm font-semibold text-red-700">{money(statement.cost)}</p></div>
        <div className="p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-500">Profit</p><p className={`mt-1 font-mono text-sm font-semibold ${statement.income - statement.cost < 0 ? 'text-red-700' : 'text-zinc-900'}`}>{money(statement.income - statement.cost)}</p></div>
      </div>
      {statement.list.length === 0 ? <p className="px-4 py-8 text-center text-xs text-zinc-500">No finance records in {statementMonth}.</p> : <ul className="divide-y divide-zinc-100">{statement.list.map((item) => <li key={item.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"><b className="font-semibold">{item.name}</b><span className="flex gap-4 font-mono"><span className="text-emerald-700">{money(item.income)}</span><span className="text-red-700">−{money(item.cost)}</span><b>{money(item.income - item.cost)}</b></span></li>)}</ul>}
    </section>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {open && <form onSubmit={save} className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1.5 text-xs font-medium">Record type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3">{['revenue', 'invoice', 'payroll', 'operating_cost', 'expense', 'inventory', 'budget'].map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Description<input required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Amount (NGN)<input required min="0" step="any" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Client<select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3"><option value="">No client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Site<select value={form.siteId} onChange={(event) => setForm({ ...form, siteId: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3"><option value="">No site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Category {isCost ? '' : '(income)'}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3"><option value="">Not set</option>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3">{['pending', 'paid', 'received', 'overdue'].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Due date<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium">Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="h-10 rounded-lg border border-zinc-200 px-3" /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">Receipt photo<input type="file" accept="image/*" onChange={attachReceipt} className="text-xs" />{form.receiptUrl ? <span className="flex items-center gap-2 text-[11px] text-emerald-700">Receipt attached<button type="button" onClick={() => setForm({ ...form, receiptUrl: '' })} className="underline">remove</button></span> : <span className="text-[10px] font-normal text-zinc-500">Optional — snap the paper receipt.</span>}</label>
      <div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-[#2A2B2E] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update record' : 'Save record'}</button><button type="button" onClick={() => { setOpen(false); setEditingId(null) }} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs">Cancel</button></div>
    </form>}
    <div className="mb-3 flex items-center gap-2"><label className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3"><Search className="size-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="w-full text-xs outline-none" /></label><button onClick={() => void load()} aria-label="Refresh finance records" className="rounded-lg border border-zinc-200 bg-white p-3"><RefreshCw className="size-3.5" /></button></div>
    <div className="overflow-x-auto rounded-[18px] border border-zinc-200 bg-white"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['TYPE', 'DESCRIPTION', 'AMOUNT', 'STATUS', 'DUE DATE', 'NOTES', ''].map((name, index) => <th key={`${name}-${index}`} className="px-4 py-3">{name}</th>)}</tr></thead><tbody>{loading ? <EmptyState colSpan={7}>Loading finance records…</EmptyState> : filtered.length === 0 ? <EmptyState colSpan={7}>{search ? 'No records match your search.' : 'No finance records in this category yet.'}</EmptyState> : filtered.map((row) => {
      const settled = settledStatuses.includes(row.status.toLowerCase())
      return <tr key={row.id} className="border-t border-zinc-100"><td className="px-4 py-3.5 capitalize">{row.kind.replaceAll('_', ' ')}</td><td className="px-4 py-3.5"><span className="block font-semibold">{row.label}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{clientName(row.clientId) ?? 'No client'}{row.category ? ` · ${row.category}` : ''}{siteName(row.siteId) ? ` · ${siteName(row.siteId)}` : ''}</span>{row.receiptUrl && <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[10px] font-semibold text-zinc-700 underline">View receipt</a>}</td><td className="px-4 py-3.5 font-mono">{money(Number(row.amount))}</td><td className="px-4 py-3.5 capitalize">{row.status}</td><td className="px-4 py-3.5">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</td><td className="max-w-[220px] px-4 py-3.5">{row.notes ?? '—'}</td><td className="px-4 py-3.5"><span className="flex flex-wrap justify-end gap-1.5"><button disabled={busyId === row.id} onClick={() => void patch(row, settled ? 'reopen' : 'settle')} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold disabled:opacity-50">{settled ? 'Reopen' : 'Mark paid'}</button><button onClick={() => edit(row)} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold">Edit</button><button disabled={busyId === row.id} onClick={() => void patch(row, 'delete')} className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 disabled:opacity-50">Delete</button></span></td></tr>
    })}</tbody></table></div>
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
  const [shift, setShift] = useState({ startHour: 8, endHour: 18 })
  const [shiftNote, setShiftNote] = useState('')
  const [shiftError, setShiftError] = useState('')
  const [savingShift, setSavingShift] = useState(false)

  const hours = Array.from({ length: 25 }, (_, hour) => hour)

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

  async function loadShift() {
    try {
      const response = await fetch('/api/shift', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load the patrol shift.')
      setShift({ startHour: payload.startHour, endHour: payload.endHour })
      setShiftError('')
    } catch (cause) {
      setShiftError(cause instanceof Error ? cause.message : 'Unable to load the patrol shift.')
    }
  }

  async function saveShift(event: React.FormEvent) {
    event.preventDefault()
    setSavingShift(true)
    setShiftError('')
    setShiftNote('')
    try {
      const response = await fetch('/api/shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shift) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save the patrol shift.')
      setShift({ startHour: payload.startHour, endHour: payload.endHour })
      setShiftNote('Patrol checkpoints updated.')
    } catch (cause) {
      setShiftError(cause instanceof Error ? cause.message : 'Unable to save the patrol shift.')
    } finally {
      setSavingShift(false)
    }
  }

  useEffect(() => { void load(); void loadGuardCode(); void loadShift() }, [])

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
      <section className="mb-5 rounded-[18px] border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Patrol shift</h2>
        <p className="mt-1 text-xs text-zinc-500">Guards sign one checkpoint every hour inside this shift, in Lagos time. A {shift.endHour - shift.startHour}-checkpoint patrol runs {String(shift.startHour).padStart(2, '0')}:00–{String(shift.endHour - 1).padStart(2, '0')}:59.</p>
        {shiftError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{shiftError}</p>}
        <form onSubmit={saveShift} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-700">Shift starts
            <select value={shift.startHour} onChange={(event) => setShift({ ...shift, startHour: Number(event.target.value) })} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs">{hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-700">Shift ends
            <select value={shift.endHour} onChange={(event) => setShift({ ...shift, endHour: Number(event.target.value) })} className="h-10 rounded-lg border border-zinc-200 px-3 text-xs">{hours.slice(1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select>
          </label>
          <button disabled={savingShift} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2A2B2E] px-3 text-xs font-semibold text-white disabled:opacity-60">{savingShift ? 'Saving…' : 'Save shift'}</button>
        </form>
        {shiftNote && <p role="status" className="mt-3 text-xs text-emerald-700">{shiftNote}</p>}
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
