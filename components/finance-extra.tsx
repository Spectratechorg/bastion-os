'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api, naira } from '@/lib/client'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
const addMonth = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m, 1)); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10) }
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime()) / 86400000)
const niceDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export type Contract = { id: string; clientName: string; title: string; sites: string | null; monthlyFee: number; startDate: string; endDate: string; nextDueDate: string }
export const dueState = (c: Contract) => { const n = daysUntil(c.nextDueDate); return n < 0 ? 'Overdue' : n <= 7 ? 'Due soon' : 'Upcoming' }

export function useList<T>(url: string) {
  const [rows, setRows] = useState<T[] | null>(null); const [error, setError] = useState('')
  const load = useCallback(async () => { try { setRows(await api<T[]>(url)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load.') } }, [url])
  useEffect(() => { void load() }, [load])
  return { rows, error, load }
}

export const FINANCE_TABS = [['Overview', '/finance', 'overview'], ['Invoices', '/finance/invoices', 'invoices'], ['Expenses', '/finance/expenses', 'expenses'], ['Contracts', '/finance/contracts', 'contracts'], ['Inventory', '/finance/inventory', 'inventory'], ['Payroll', '/finance/payroll', 'payroll']] as const

/** The one tab bar shared by every Finance page. */
export function FinanceTabs({ active }: { active: string }) {
  return <nav className="mb-5 flex gap-6 overflow-x-auto border-b border-[#D4D4D8]">{FINANCE_TABS.map(([label, href, key]) => <Link key={key} href={href} className={`whitespace-nowrap border-b-2 px-0.5 pb-3 text-xs ${active === key ? 'border-[#2A2B2E] font-semibold' : 'border-transparent text-zinc-500'}`}>{label}</Link>)}</nav>
}

/** Contract figures for the Finance overview. Gross payroll is read from the payroll API. */
export function ContractSummary() {
  const { rows } = useList<Contract>('/api/contracts')
  const [grossPayroll, setGross] = useState(0)
  useEffect(() => { api<{ rows: { baseSalary: number }[] }>('/api/payroll').then((d) => setGross(d.rows.reduce((t, r) => t + r.baseSalary, 0))).catch(() => undefined) }, [])
  if (!rows) return null
  const live = rows.filter((c) => c.endDate >= today())
  const monthly = live.reduce((t, c) => t + c.monthlyFee, 0)
  const soon = live.filter((c) => { const n = daysUntil(c.nextDueDate); return n >= 0 && n <= 30 })
  const overdue = live.filter((c) => daysUntil(c.nextDueDate) < 0)
  const margin = monthly - grossPayroll
  const cards: [string, string, string][] = [['Contract value', naira(monthly), `${live.length} active contract${live.length === 1 ? '' : 's'}`], ['Due in 30 days', naira(soon.reduce((t, c) => t + c.monthlyFee, 0)), `${soon.length} payment${soon.length === 1 ? '' : 's'}`], ['Overdue', naira(overdue.reduce((t, c) => t + c.monthlyFee, 0)), `${overdue.length} contract${overdue.length === 1 ? '' : 's'}`], ['Income less payroll', naira(margin), 'Contract income minus gross payroll']]
  const upcoming = [...live].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)).slice(0, 5)
  return <>
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(([k, v, sub]) => <div key={k} className="rounded-[18px] border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{k}</p><p className="mt-2 font-mono text-[22px] font-semibold tracking-tight">{v}</p><p className="mt-1 text-[11px] text-zinc-500">{sub}</p></div>)}</section>
    {upcoming.length > 0 && <section className="mb-4 rounded-[18px] border border-zinc-200 bg-white p-5"><h2 className="text-[15px] font-semibold">Next payment due dates</h2><ul className="mt-3 divide-y divide-zinc-100">{upcoming.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-xs"><span className="min-w-0 flex-1"><b className="block truncate text-[13px] font-semibold">{c.clientName}</b><span className="text-zinc-500">{c.title}</span></span><span className="font-mono">{naira(c.monthlyFee)}</span><span className="w-24 text-right text-zinc-500">{niceDate(c.nextDueDate)}</span><Badge value={dueState(c)} /></li>)}</ul></section>}
  </>
}

function ContractSheet({ row, onClose, onSaved }: { row: Contract | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ clientName: row?.clientName ?? '', title: row?.title ?? 'Guarding services', sites: row?.sites ?? '', monthlyFee: String(row?.monthlyFee ?? ''), startDate: row?.startDate ?? today(), endDate: row?.endDate ?? '', nextDueDate: row?.nextDueDate ?? '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); try { await api('/api/contracts', { method: row ? 'PATCH' : 'POST', json: { ...(row ? { id: row.id } : {}), ...v, sites: v.sites || null } }); onSaved() } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to save.') } finally { setBusy(false) } }
  return <Sheet title={row ? 'Edit contract' : 'Add contract'} kicker="CONTRACT" onClose={onClose} footer={<><button type="button" className={btn} onClick={onClose}>Cancel</button><button form="contract-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save contract'}</button></>}>
    <form id="contract-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={err} />
      <Field label="Client"><input required className={inputClass} value={v.clientName} onChange={(e) => setV({ ...v, clientName: e.target.value })} placeholder="e.g. Arbico Plc" /></Field>
      <Field label="Contract title"><input required className={inputClass} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      <Field label="Sites covered" hint="Optional, e.g. Eko Atlantic Tower, Gate 2"><input className={inputClass} value={v.sites} onChange={(e) => setV({ ...v, sites: e.target.value })} /></Field>
      <Field label="Contract value (₦)"><input required type="number" min={0} className={inputClass} value={v.monthlyFee} onChange={(e) => setV({ ...v, monthlyFee: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input required type="date" className={inputClass} value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field><Field label="Ends"><input required type="date" className={inputClass} value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field></div>
      <Field label="Next payment due"><input required type="date" className={inputClass} value={v.nextDueDate} onChange={(e) => setV({ ...v, nextDueDate: e.target.value })} /></Field>
    </form></Sheet>
}

export function ContractsTab() {
  const { rows, error, load } = useList<Contract>('/api/contracts'); const [edit, setEdit] = useState<Contract | 'new' | null>(null); const [problem, setProblem] = useState('')
  async function paid(c: Contract) { try { await api('/api/contracts', { method: 'PATCH', json: { id: c.id, nextDueDate: addMonth(c.nextDueDate) } }); void load() } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to update.') } }
  async function del(c: Contract) { if (!window.confirm(`Delete the ${c.clientName} contract?`)) return; try { await api(`/api/contracts?id=${c.id}`, { method: 'DELETE' }); void load() } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to delete.') } }
  return <>
    <div className="mb-3 flex justify-end"><button className={btnPrimary} onClick={() => setEdit('new')}><Plus className="size-4" />Add contract</button></div>
    <ErrorBanner message={error || problem} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">{!rows ? <Spinner /> : rows.length === 0 ? <Empty title="No contracts yet" text="Add each client contract with its monthly fee and next payment date." /> : <ul className="divide-y divide-zinc-100">{rows.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-3 p-4 text-xs"><span className="min-w-[180px] flex-1"><b className="block text-sm font-semibold">{c.clientName}</b><span className="text-zinc-500">{c.title}{c.sites ? ` · ${c.sites}` : ''}</span><span className="mt-0.5 block text-[10px] text-zinc-400">{niceDate(c.startDate)} to {niceDate(c.endDate)}</span></span><span className="font-mono text-sm">{naira(c.monthlyFee)}</span><span className="text-right"><span className="block text-[10px] uppercase tracking-wide text-zinc-500">Next due</span><span className="font-mono">{niceDate(c.nextDueDate)}</span></span><Badge value={c.endDate < today() ? 'Ended' : dueState(c)} /><span className="flex gap-1.5"><button className={smallBtn} onClick={() => void paid(c)}>Record payment</button><button className={smallBtn} onClick={() => setEdit(c)}>Edit</button><button className={`${smallBtn} text-[#B42318]`} onClick={() => void del(c)}>Delete</button></span></li>)}</ul>}</div>
    <p className="mt-3 text-[11px] text-zinc-500">“Record payment” moves the next due date forward by one month.</p>
    {edit && <ContractSheet row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />}
  </>
}

type Item = { id: string; name: string; category: string; quantity: number; minQuantity: number; location: string | null; unitCost: number; notes: string | null }

function ItemSheet({ row, onClose, onSaved }: { row: Item | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: row?.name ?? '', category: row?.category ?? 'Radios', quantity: String(row?.quantity ?? 1), minQuantity: String(row?.minQuantity ?? 0), location: row?.location ?? '', unitCost: String(row?.unitCost ?? 0), notes: row?.notes ?? '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); try { await api('/api/inventory', { method: row ? 'PATCH' : 'POST', json: { ...(row ? { id: row.id } : {}), ...v, location: v.location || null, notes: v.notes || null } }); onSaved() } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to save.') } finally { setBusy(false) } }
  return <Sheet title={row ? 'Edit item' : 'Add item'} kicker="INVENTORY" onClose={onClose} footer={<><button type="button" className={btn} onClick={onClose}>Cancel</button><button form="item-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save item'}</button></>}>
    <form id="item-form" onSubmit={submit} className="grid gap-4"><ErrorBanner message={err} />
      <Field label="Item"><input required className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Motorola two-way radio" /></Field>
      <Field label="Category"><input required className={inputClass} list="inv-cats" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} /><datalist id="inv-cats">{['Radios', 'Uniforms', 'Torches', 'Batons', 'NFC tags', 'Vehicles', 'Other'].map((c) => <option key={c} value={c} />)}</datalist></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input required type="number" min={0} className={inputClass} value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field><Field label="Restock at" hint="Warn at or below"><input required type="number" min={0} className={inputClass} value={v.minQuantity} onChange={(e) => setV({ ...v, minQuantity: e.target.value })} /></Field></div>
      <Field label="Unit cost (₦)"><input required type="number" min={0} className={inputClass} value={v.unitCost} onChange={(e) => setV({ ...v, unitCost: e.target.value })} /></Field>
      <Field label="Where it is kept" hint="Store, site or person"><input className={inputClass} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
      <Field label="Notes"><input className={inputClass} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
    </form></Sheet>
}

export function InventoryTab() {
  const { rows, error, load } = useList<Item>('/api/inventory'); const [edit, setEdit] = useState<Item | 'new' | null>(null); const [problem, setProblem] = useState('')
  const total = (rows ?? []).reduce((t, r) => t + r.quantity * r.unitCost, 0); const low = (rows ?? []).filter((r) => r.quantity <= r.minQuantity)
  async function del(r: Item) { if (!window.confirm(`Remove ${r.name} from inventory?`)) return; try { await api(`/api/inventory?id=${r.id}`, { method: 'DELETE' }); void load() } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to delete.') } }
  async function adjust(r: Item, by: number) { try { await api('/api/inventory', { method: 'PATCH', json: { id: r.id, quantity: Math.max(0, r.quantity + by) } }); void load() } catch (e) { setProblem(e instanceof Error ? e.message : 'Unable to update.') } }
  return <>
    <section className="mb-4 grid grid-cols-3 gap-3">{[[String(rows?.length ?? '—'), 'Items'], [naira(total), 'Stock value'], [String(low.length), 'Need restocking']].map(([v, k]) => <div key={k} className="rounded-[18px] border border-zinc-200 bg-white p-4"><p className="font-mono text-xl font-semibold">{v}</p><p className="mt-1 text-xs text-zinc-500">{k}</p></div>)}</section>
    <div className="mb-3 flex justify-end"><button className={btnPrimary} onClick={() => setEdit('new')}><Plus className="size-4" />Add item</button></div>
    <ErrorBanner message={error || problem} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">{!rows ? <Spinner /> : rows.length === 0 ? <Empty title="No inventory yet" text="Track radios, uniforms, torches and other equipment you issue to guards." /> : <ul className="divide-y divide-zinc-100">{rows.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-xs"><span className="min-w-[180px] flex-1"><b className="block text-sm font-semibold">{r.name}</b><span className="text-zinc-500">{r.category}{r.location ? ` · ${r.location}` : ''}</span></span><span className="flex items-center gap-1.5"><button aria-label={`Remove one ${r.name}`} className={smallBtn} onClick={() => void adjust(r, -1)}>−</button><span className="w-10 text-center font-mono text-sm">{r.quantity}</span><button aria-label={`Add one ${r.name}`} className={smallBtn} onClick={() => void adjust(r, 1)}>+</button></span><span className="w-24 text-right font-mono">{naira(r.quantity * r.unitCost)}</span><Badge value={r.quantity <= r.minQuantity ? 'Restock' : 'In stock'} /><span className="flex gap-1.5"><button className={smallBtn} onClick={() => setEdit(r)}>Edit</button><button className={`${smallBtn} text-[#B42318]`} onClick={() => void del(r)}>Delete</button></span></li>)}</ul>}</div>
    {edit && <ItemSheet row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />}
  </>
}

type Person = { id: string; name: string; title: string; phone: string | null; monthlySalary: number; startDate: string; status: string }

/** Non-guard staff (office, drivers, supervisors) who are paid through the same payroll. */
export function StaffSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { rows, load } = useList<Person>('/api/staff'); const [v, setV] = useState({ name: '', title: '', monthlySalary: '', startDate: today() }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function add(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); try { await api('/api/staff', { method: 'POST', json: v }); setV({ name: '', title: '', monthlySalary: '', startDate: today() }); void load(); onChanged() } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to add.') } finally { setBusy(false) } }
  async function change(p: Person, patch: Record<string, unknown>) { try { await api('/api/staff', { method: 'PATCH', json: { id: p.id, ...patch } }); void load(); onChanged() } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to update.') } }
  async function del(p: Person) { if (!window.confirm(`Remove ${p.name}? Past payroll records are kept.`)) return; try { await api(`/api/staff?id=${p.id}`, { method: 'DELETE' }); void load(); onChanged() } catch (x) { setErr(x instanceof Error ? x.message : 'Unable to remove.') } }
  return <Sheet title="Office and other staff" kicker="PAYROLL" onClose={onClose}>
    <p className="mb-4 text-xs leading-5 text-zinc-600">Add people who are not guards, such as office staff, drivers and supervisors. They are paid through the same payroll, with no pension and no absence deduction because they do not scan in.</p>
    <ErrorBanner message={err} />
    <form onSubmit={add} className="grid gap-3 rounded-xl border border-zinc-200 p-3"><div className="grid grid-cols-2 gap-3"><Field label="Name"><input required className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field><Field label="Role"><input required className={inputClass} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Accountant" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Monthly salary (₦)"><input required type="number" min={0} className={inputClass} value={v.monthlySalary} onChange={(e) => setV({ ...v, monthlySalary: e.target.value })} /></Field><Field label="Start date"><input required type="date" className={inputClass} value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field></div><button className={btnPrimary} disabled={busy}><Plus className="size-4" />Add staff member</button></form>
    <ul className="mt-4 divide-y divide-zinc-100">{!rows ? <Spinner /> : rows.length === 0 ? <li className="py-6 text-center text-xs text-zinc-500">No staff added yet.</li> : rows.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 py-3 text-xs"><span className="min-w-0 flex-1"><b className="block text-[13px] font-semibold">{p.name}</b><span className="text-zinc-500">{p.title} · {naira(p.monthlySalary)} · from {niceDate(p.startDate)}</span></span><Badge value={p.status} /><button className={smallBtn} onClick={() => void change(p, { status: p.status === 'active' ? 'inactive' : 'active' })}>{p.status === 'active' ? 'Deactivate' : 'Activate'}</button><button className={`${smallBtn} text-[#B42318]`} onClick={() => void del(p)}>Remove</button></li>)}</ul>
  </Sheet>
}
