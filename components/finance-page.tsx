'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Spinner, btn, inputClass } from '@/components/ui-bits'
import { api, naira } from '@/lib/client'

type Pay = { id: string; guardId: string; guardName: string; photoUrl: string | null; site: string | null; period: string; baseSalary: number; daysInPeriod: number; daysPresent: number; daysAbsent: number; absenceDeduction: number; netPay: number; status: string }
type Data = { period: string; rows: Pay[]; isModerator: boolean }

function useMonth() {
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7))
  return [period, setPeriod] as const
}

function usePayroll(period: string) {
  const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { try { setData(await api<Data>(`/api/payroll?period=${period}`)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load payroll.') } finally { setLoading(false) } }, [period])
  useEffect(() => { setLoading(true); void load() }, [load])
  return { data, setData, error, setError, loading, setLoading, load }
}

function Tabs({ active }: { active: 'overview' | 'payroll' }) {
  return <nav className="mb-5 flex gap-6 border-b border-[#D4D4D8]">{([['Overview', '/finance', 'overview'], ['Payroll', '/finance/payroll', 'payroll']] as const).map(([label, href, key]) => <Link key={key} href={href} className={`border-b-2 px-0.5 pb-3 text-xs ${active === key ? 'border-[#2A2B2E] font-semibold' : 'border-transparent text-zinc-500'}`}>{label}</Link>)}</nav>
}

function Toolbar({ period, setPeriod, refresh }: { period: string; setPeriod: (value: string) => void; refresh: () => void }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2"><input type="month" aria-label="Pay period" value={period} max={new Date().toLocaleDateString('en-CA').slice(0, 7)} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={`${inputClass.replace("w-full", "w-auto")}`} /><button className={btn} onClick={refresh}><RefreshCw className="size-3.5" />Recalculate</button><a className={btn} href="/api/export?section=payroll"><Download className="size-3.5" />Export CSV</a></div>
}

export function FinancePage({ tab }: { tab: 'overview' | 'payroll' }) {
  const [period, setPeriod] = useMonth(); const { data, setData, error, setError, loading, setLoading, load } = usePayroll(period)
  const [busy, setBusy] = useState<string | null>(null)
  const rows = data?.rows ?? []
  const totals = useMemo(() => {
    const sum = (list: Pay[], key: keyof Pay) => list.reduce((total, row) => total + Number(row[key]), 0)
    const paid = rows.filter((r) => r.status === 'paid'); const pending = rows.filter((r) => r.status !== 'paid')
    return { gross: sum(rows, 'baseSalary'), absence: sum(rows, 'absenceDeduction'), net: sum(rows, 'netPay'), paid: sum(paid, 'netPay'), pending: sum(pending, 'netPay'), paidCount: paid.length, pendingCount: pending.length }
  }, [rows])
  const bySite = useMemo(() => { const map = new Map<string, { guards: number; net: number; paid: number }>(); for (const r of rows) { const key = r.site ?? 'Unassigned'; const item = map.get(key) ?? { guards: 0, net: 0, paid: 0 }; item.guards += 1; item.net += r.netPay; if (r.status === 'paid') item.paid += r.netPay; map.set(key, item) } return [...map.entries()].sort((a, b) => b[1].net - a[1].net) }, [rows])

  async function toggle(row: Pay) {
    const next = row.status === 'paid' ? 'pending' : 'paid'
    if (next === 'paid' && !window.confirm(`Mark ${row.guardName} as paid (${naira(row.netPay)})? Paid rows are locked from recalculation.`)) return
    setBusy(row.id)
    try { const updated = await api<Pay>('/api/payroll', { method: 'PATCH', json: { id: row.id, status: next } }); setData((d) => d && { ...d, rows: d.rows.map((r) => r.id === row.id ? { ...r, status: updated.status } : r) }); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update payment status.') } finally { setBusy(null) }
  }

  return <>
    <PageHeader title="Finance" subtitle="Payroll for your guards, calculated from attendance. Napoleon reports on the same figures." />
    <Tabs active={tab} />
    <StatStrip stats={[[naira(totals.net), 'Net payable'], [naira(totals.paid), `Paid (${totals.paidCount})`], [naira(totals.pending), `Pending (${totals.pendingCount})`], [naira(totals.absence), 'Absence deductions']]} />
    <Toolbar period={period} setPeriod={setPeriod} refresh={() => { setLoading(true); void load() }} />
    <ErrorBanner message={error} retry={() => void load()} />
    {loading && !data ? <div className="rounded-[18px] border border-zinc-200 bg-white"><Spinner label="Calculating payroll…" /></div> : rows.length === 0 ? <div className="rounded-[18px] border border-zinc-200 bg-white"><Empty title="No payroll for this month" text="Register guards and record attendance to generate payroll." /></div> : tab === 'overview' ? <>
      <section className="grid gap-3 sm:grid-cols-3">
        {[['Gross salaries', totals.gross], ['Absence deductions', totals.absence]].map(([label, value]) => <div key={String(label)} className="rounded-[18px] border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 font-mono text-xl font-semibold">{naira(Number(value))}</p></div>)}
      </section>
      <section className="mt-3 overflow-hidden rounded-[18px] border border-zinc-200 bg-white"><h2 className="border-b border-zinc-100 p-4 text-sm font-semibold">Payroll by site</h2><ul className="divide-y divide-zinc-100">{bySite.map(([site, v]) => <li key={site} className="flex flex-wrap items-center justify-between gap-2 p-4 text-xs"><span><b className="block text-sm font-semibold">{site}</b><span className="text-zinc-500">{v.guards} guard{v.guards === 1 ? '' : 's'}</span></span><span className="text-right"><b className="block font-mono text-sm">{naira(v.net)}</b><span className="text-zinc-500">{naira(v.paid)} paid</span></span></li>)}</ul></section>
    </> : <>
      {!data?.isModerator && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Only a moderator or administrator can tick payments as paid.</p>}
      <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-xs"><thead className="bg-zinc-50 text-[10px] tracking-wide text-zinc-500"><tr>{['PAID', 'GUARD', 'DAYS PRESENT', 'DAYS ABSENT', 'BASE', 'ABSENCE', 'NET PAY', 'STATUS'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-zinc-100"><td className="px-4 py-3"><input type="checkbox" aria-label={`Mark ${r.guardName} paid`} className="size-5 accent-[#2A2B2E]" checked={r.status === 'paid'} disabled={!data?.isModerator || busy === r.id} onChange={() => void toggle(r)} /></td><td className="px-4 py-3"><span className="flex items-center gap-2.5"><Avatar name={r.guardName} src={r.photoUrl} size={30} /><span><b className="block font-semibold">{r.guardName}</b><span className="text-zinc-500">{r.site ?? 'Unassigned'}</span></span></span></td><td className="px-4 py-3 font-mono">{r.daysPresent}</td><td className="px-4 py-3 font-mono">{r.daysAbsent}</td><td className="px-4 py-3 font-mono">{naira(r.baseSalary)}</td><td className="px-4 py-3 font-mono">−{naira(r.absenceDeduction)}</td><td className="px-4 py-3 font-mono font-semibold">{naira(r.netPay)}</td><td className="px-4 py-3"><Badge value={r.status} /></td></tr>)}</tbody></table></div>
        <ul className="divide-y divide-zinc-100 md:hidden">{rows.map((r) => <li key={r.id} className="p-4 text-xs"><div className="flex items-center gap-3"><Avatar name={r.guardName} src={r.photoUrl} /><span className="min-w-0 flex-1"><b className="block text-sm font-semibold">{r.guardName}</b><span className="text-zinc-500">{r.site ?? 'Unassigned'}</span></span><Badge value={r.status} /></div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{([['Present', `${r.daysPresent} day${r.daysPresent === 1 ? '' : 's'}`], ['Absent', `${r.daysAbsent} day${r.daysAbsent === 1 ? '' : 's'}`], ['Base', naira(r.baseSalary)], ['Absence', `−${naira(r.absenceDeduction)}`], ['Net pay', naira(r.netPay)]] as const).map(([k, val]) => <div key={k}><dt className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</dt><dd className="font-mono">{val}</dd></div>)}</dl>
          <label className="mt-3 flex min-h-[44px] items-center gap-3 rounded-lg bg-zinc-50 px-3 font-semibold"><input type="checkbox" className="size-5 accent-[#2A2B2E]" checked={r.status === 'paid'} disabled={!data?.isModerator || busy === r.id} onChange={() => void toggle(r)} />Mark as paid</label></li>)}</ul>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">Net pay = base salary − (daily rate × days absent). Days absent are counted from the guard’s start date through today (or month-end) when no attendance record exists. There is no pension deduction or overtime.</p>
    </>}
  </>
}
