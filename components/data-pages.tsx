'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, Plus, RefreshCw, Search } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { photoToDataUrl } from '@/lib/client'

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
      <button onClick={() => { setEditingId(null); setForm(emptyForm(defaultKind[page] ?? 'revenue')); setOpen(!open) }} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-black px-3.5 text-xs font-semibold text-white"><Plus className="size-3.5" />Add record</button>
    </PageHeader>
    <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-zinc-200 text-xs">{Object.keys(financeFilters).map((item) => <a key={item} href={item === 'overview' ? '/finance' : `/finance/${item}`} className={`border-b-2 pb-3 capitalize ${item === page ? 'border-black font-semibold' : 'border-transparent text-zinc-500'}`}>{item}</a>)}<a href="/finance/payroll" className="border-b-2 border-transparent pb-3 text-zinc-500">Payroll run</a></nav>
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
      <div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-black px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update record' : 'Save record'}</button><button type="button" onClick={() => { setOpen(false); setEditingId(null) }} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs">Cancel</button></div>
    </form>}
    <div className="mb-3 flex items-center gap-2"><label className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3"><Search className="size-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="w-full text-xs outline-none" /></label><button onClick={() => void load()} aria-label="Refresh finance records" className="rounded-lg border border-zinc-200 bg-white p-3"><RefreshCw className="size-3.5" /></button></div>
    <div className="overflow-x-auto rounded-[18px] border border-zinc-200 bg-white"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['TYPE', 'DESCRIPTION', 'AMOUNT', 'STATUS', 'DUE DATE', 'NOTES', ''].map((name, index) => <th key={`${name}-${index}`} className="px-4 py-3">{name}</th>)}</tr></thead><tbody>{loading ? <EmptyState colSpan={7}>Loading finance records…</EmptyState> : filtered.length === 0 ? <EmptyState colSpan={7}>{search ? 'No records match your search.' : 'No finance records in this category yet.'}</EmptyState> : filtered.map((row) => {
      const settled = settledStatuses.includes(row.status.toLowerCase())
      return <tr key={row.id} className="border-t border-zinc-100"><td className="px-4 py-3.5 capitalize">{row.kind.replaceAll('_', ' ')}</td><td className="px-4 py-3.5"><span className="block font-semibold">{row.label}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{clientName(row.clientId) ?? 'No client'}{row.category ? ` · ${row.category}` : ''}{siteName(row.siteId) ? ` · ${siteName(row.siteId)}` : ''}</span>{row.receiptUrl && <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[10px] font-semibold text-zinc-700 underline">View receipt</a>}</td><td className="px-4 py-3.5 font-mono">{money(Number(row.amount))}</td><td className="px-4 py-3.5 capitalize">{row.status}</td><td className="px-4 py-3.5">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</td><td className="max-w-[220px] px-4 py-3.5">{row.notes ?? '—'}</td><td className="px-4 py-3.5"><span className="flex flex-wrap justify-end gap-1.5"><button disabled={busyId === row.id} onClick={() => void patch(row, settled ? 'reopen' : 'settle')} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold disabled:opacity-50">{settled ? 'Reopen' : 'Mark paid'}</button><button onClick={() => edit(row)} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold">Edit</button><button disabled={busyId === row.id} onClick={() => void patch(row, 'delete')} className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 disabled:opacity-50">Delete</button></span></td></tr>
    })}</tbody></table></div>
  </>
}

