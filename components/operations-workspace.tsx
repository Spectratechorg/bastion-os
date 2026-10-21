'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Edit3, Plus, RefreshCw } from 'lucide-react'

type Row = Record<string, unknown> & { id: string }
type Config = { title: string; description: string; fields: string[]; columns: string[] }

const configs: Record<string, Config> = {
  guards: { title: 'Guard registry', description: 'Enroll personnel, issue NFC credentials, assign sites, and manage status.', fields: ['name', 'nin', 'phone', 'site'], columns: ['name', 'nin', 'phone', 'site', 'status', 'nfcToken'] },
  sites: { title: 'Site command', description: 'Manage operational sites and attendance geofences.', fields: ['name', 'address', 'latitude', 'longitude', 'geofenceRadius'], columns: ['name', 'address', 'latitude', 'longitude', 'geofenceRadius', 'status'] },
  attendance: { title: 'Attendance ledger', description: 'Every check-in, exact time, method, and boundary result.', fields: [], columns: ['guardId', 'siteId', 'checkedInAt', 'method', 'withinGeofence'] },
  patrols: { title: 'Patrol repository', description: 'Read-only hourly patrol evidence from 21:00 to 00:00. Missed windows become alerts.', fields: [], columns: ['guardId', 'siteId', 'loggedAt', 'method', 'withinBounds'] },
  'live-map': { title: 'Live map', description: 'Only persisted patrol coordinates appear here. No synthetic markers.', fields: [], columns: [] },
  incidents: { title: 'Incident queue', description: 'Log, triage and resolve security incidents.', fields: ['title', 'description', 'site', 'severity'], columns: ['title', 'site', 'severity', 'status', 'reportedAt'] },
  alerts: { title: 'Alert center', description: 'Missed hourly check-ins, wrong locations, and unusual activity.', fields: [], columns: ['type', 'title', 'severity', 'acknowledged', 'createdAt'] },
  finances: { title: 'Finance control', description: 'Revenue, operating costs, client payments, inventory and payroll deadlines.', fields: ['kind', 'label', 'amount', 'status', 'dueDate'], columns: ['kind', 'label', 'amount', 'status', 'dueDate'] },
}

function display(row: Row, key: string) {
  const value = row[key]
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Within bounds' : 'Outside bounds'
  if (key.toLowerCase().includes('at') || key.toLowerCase().includes('date')) return new Date(String(value)).toLocaleString()
  return String(value)
}

export function OperationsWorkspace({ section }: { section: string }) {
  const current = configs[section]
  const [rows, setRows] = useState<Row[]>([])
  const [sites, setSites] = useState<Row[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/operations?section=${section}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to load records.')
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'Unable to load records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (section === 'guards') {
      fetch('/api/operations?section=sites', { cache: 'no-store' })
        .then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error ?? 'Unable to load sites.')
          setSites(Array.isArray(data) ? data : [])
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load sites.'))
    }
  }, [section])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { section, ...form }
      const response = await fetch('/api/operations', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to save the record.')
      setForm({})
      setEditing(null)
      setOpen(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the record.')
    } finally {
      setSaving(false)
    }
  }

  const guardStats = useMemo(() => ({ active: rows.filter((row) => row.status === 'active').length, assigned: rows.filter((row) => row.site).length }), [rows])
  const patrolStats = useMemo(() => ({ total: rows.length, inBounds: rows.filter((row) => row.withinBounds).length }), [rows])
  const financeStats = useMemo(() => ({ revenue: rows.filter((row) => row.kind === 'revenue').reduce((sum, row) => sum + Number(row.amount ?? 0), 0), costs: rows.filter((row) => ['cost', 'expense', 'salary'].includes(String(row.kind))).reduce((sum, row) => sum + Number(row.amount ?? 0), 0), pending: rows.filter((row) => !['paid', 'settled'].includes(String(row.status))).length }), [rows])

  if (!current) return null

  const startEdit = (row: Row) => {
    setEditing(row)
    setForm(Object.fromEntries(current.fields.map((field) => [field, String(row[field] ?? '')])))
    setOpen(true)
  }

  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#18352f]">
      <header className="border-b border-[#dce6e1] bg-[#fbfcfb] px-6 py-5 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <a href="/" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#71847e] hover:text-[#173f37]" aria-label="Back to BastionOS overview"><ArrowLeft className="size-3.5" /> Back to overview</a>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{current.title}</h1>
            <p className="mt-1 text-sm text-[#71817c]">{current.description}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="rounded-lg border border-[#d5e0db] bg-white p-2.5" aria-label="Refresh"><RefreshCw className="size-4" /></button>
            {current.fields.length > 0 && <button onClick={() => { setEditing(null); setForm({}); setOpen(!open) }} className="flex items-center gap-2 rounded-lg bg-[#173f37] px-3 py-2 text-xs font-bold text-white"><Plus className="size-4" /> {section === 'guards' ? 'Add guard' : 'Create record'}</button>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] p-6 lg:p-10">
        {section === 'guards' && <div className="mb-6 grid gap-3 md:grid-cols-3"><Metric label="Total guards" value={String(rows.length)} /><Metric label="Active" value={String(guardStats.active)} tone="text-[#2d846d]" /><Metric label="Assigned to site" value={String(guardStats.assigned)} /></div>}
        {section === 'finances' && <div className="mb-6 grid gap-3 md:grid-cols-3"><Metric label="Total revenue" value={`₦${financeStats.revenue.toLocaleString()}`} tone="text-[#2d846d]" /><Metric label="Operating costs" value={`₦${financeStats.costs.toLocaleString()}`} tone="text-[#cb6846]" /><Metric label="Pending payments" value={String(financeStats.pending)} tone="text-[#b77a20]" /></div>}
        {section === 'patrols' && <div className="mb-6 flex gap-3"><Metric label="Logged patrols" value={String(patrolStats.total)} /><Metric label="Within bounds" value={String(patrolStats.inBounds)} tone="text-[#2d846d]" /></div>}
        {open && <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl border border-[#dce6e1] bg-white p-5 md:grid-cols-2">{current.fields.map((field) => <label key={field} className="flex flex-col gap-2 text-xs font-semibold capitalize text-[#536b64]">{field}{field === 'site' ? <select value={form[field] ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} className="rounded-lg border border-[#d5e0db] px-3 py-2 text-sm font-normal"><option value="">Unassigned</option>{sites.map((site) => <option key={site.id} value={String(site.name ?? site.id)}>{String(site.name ?? site.id)}</option>)}</select> : <input required={['name', 'nin', 'phone', 'label', 'amount', 'latitude', 'longitude', 'geofenceRadius'].includes(field)} type={['amount', 'latitude', 'longitude', 'geofenceRadius'].includes(field) ? 'number' : 'text'} step={['latitude', 'longitude'].includes(field) ? 'any' : undefined} value={form[field] ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} className="rounded-lg border border-[#d5e0db] px-3 py-2 text-sm font-normal" />}</label>)}<div className="flex gap-2 md:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-[#173f37] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create record'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#d5e0db] px-4 py-2 text-sm font-semibold">Cancel</button></div></form>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {section === 'live-map' ? <div className="rounded-2xl border border-[#dce6e1] bg-white p-10 text-center text-sm text-[#71817c]">No persisted locations have been reported yet.</div> : <div className="overflow-x-auto rounded-2xl border border-[#dce6e1] bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-[#dce6e1] bg-[#f8faf9] text-xs uppercase tracking-wider text-[#71817c]"><tr>{current.columns.map((column) => <th key={column} className="px-5 py-4">{column}</th>)}{current.fields.length > 0 && <th className="px-5 py-4">Action</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={current.columns.length + 1} className="px-5 py-10 text-center text-[#71817c]">Loading live records…</td></tr> : rows.length === 0 ? <tr><td colSpan={current.columns.length + 1} className="px-5 py-10 text-center text-[#71817c]">No records yet.</td></tr> : rows.map((row) => <tr key={row.id} className="border-b border-[#edf2ef] last:border-0">{current.columns.map((column) => <td key={column} className="px-5 py-4">{display(row, column)}</td>)}{current.fields.length > 0 && <td className="px-5 py-4"><button onClick={() => startEdit(row)} className="inline-flex items-center gap-1 text-xs font-bold text-[#2d846d]"><Edit3 className="size-3.5" /> Edit</button></td>}</tr>)}</tbody></table></div>}
      </main>
    </div>
  )
}

function Metric({ label, value, tone = 'text-[#173f37]' }: { label: string; value: string; tone?: string }) { return <div className="rounded-2xl border border-[#dce6e1] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-[#71817c]">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p></div> }
