'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { ErrorBanner, Spinner, btn, inputClass } from '@/components/ui-bits'
import { api, naira, when } from '@/lib/client'

type Summary = {
  guards: { total: number; active: number }
  sites: { total: number; active: number }
  incidents: { total: number; open: number; reportedInRange: number }
  clients: number
  attendance: { checkIns: number; outsideGeofence: number; flagged: number; guardsSeen: number }
  patrols: { total: number; completed: number; guardsSeen: number; completionRate: number }
  finance: { income: number; costs: number; profit: number; unsettled: number; incomeSettled: number; records: number; costByCategory: { label: string; amount: number }[] }
}
type Report = { generatedAt: string; from: string; to: string; summary: Summary }

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
const monthStart = () => `${today().slice(0, 7)}-01`

const presets: { label: string; from: () => string; to: () => string }[] = [
  { label: 'This month', from: monthStart, to: today },
  { label: 'Last 7 days', from: () => new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }), to: today },
  { label: 'Last 30 days', from: () => new Date(Date.now() - 29 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }), to: today },
  { label: 'This year', from: () => `${today().slice(0, 4)}-01-01`, to: today },
]

export function ReportsPage() {
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await api<Report>(`/api/reports?from=${from}&to=${to}`))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to build the report.')
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const summary = report?.summary
  const exports = useMemo(() => [
    { label: 'Guards', detail: `${summary?.guards.total ?? 0} on the roster`, href: '/api/export?section=guards' },
    { label: 'Sites', detail: `${summary?.sites.total ?? 0} sites`, href: '/api/export?section=sites' },
    { label: 'Attendance', detail: `${summary?.attendance.checkIns ?? 0} check-ins in this range`, href: '/api/export?section=attendance' },
    { label: 'Patrols', detail: `${summary?.patrols.total ?? 0} patrols in this range`, href: '/api/export?section=patrols' },
    { label: 'Incidents', detail: `${summary?.incidents.reportedInRange ?? 0} reported in this range`, href: '/api/export?section=incidents' },
    { label: 'Clients', detail: `${summary?.clients ?? 0} clients`, href: '/api/export?section=clients' },
    { label: 'Finance', detail: `${summary?.finance.records ?? 0} records in this range`, href: '/api/export?section=finances' },
    { label: 'Payroll', detail: 'Payroll rows for every month', href: '/api/export?section=payroll' },
  ], [summary])

  return <>
    <PageHeader title="Reports" subtitle="Pick any date range and see what actually happened in it.">
      <button onClick={() => void load()} className={btn}><RefreshCw className="size-3.5" />Rebuild</button>
    </PageHeader>

    <section className="mb-4 rounded-[18px] border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-700">From<input type="date" value={from} max={to} onChange={(event) => event.target.value && setFrom(event.target.value)} className={`${inputClass.replace('w-full', 'w-auto')} h-10`} /></label>
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-700">To<input type="date" value={to} min={from} max={today()} onChange={(event) => event.target.value && setTo(event.target.value)} className={`${inputClass.replace('w-full', 'w-auto')} h-10`} /></label>
        <div className="flex flex-wrap gap-1.5">{presets.map((preset) => <button key={preset.label} onClick={() => { setFrom(preset.from()); setTo(preset.to()) }} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] font-semibold hover:bg-zinc-50">{preset.label}</button>)}</div>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">Counts below only include records created inside {from} → {to}. Guard, site and client totals are always the current live figures.{report ? ` Report built ${when(report.generatedAt)}.` : ''}</p>
    </section>

    <ErrorBanner message={error} retry={() => void load()} />

    {loading && !report ? <div className="rounded-[18px] border border-zinc-200 bg-white"><Spinner label="Building the report…" /></div> : summary && <>
      <StatStrip stats={[
        [`${summary.patrols.completionRate}%`, 'Patrol completion'],
        [String(summary.attendance.checkIns), 'Check-ins'],
        [String(summary.incidents.reportedInRange), 'Incidents reported'],
        [naira(summary.finance.profit), 'Profit in range'],
      ]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Attendance & patrols</h2><p className="mt-1 text-xs text-zinc-500">What the guards actually did in this range.</p></header>
          <dl className="divide-y divide-zinc-100 text-xs">
            {[
              ['Check-ins', String(summary.attendance.checkIns)],
              ['Guards who scanned', String(summary.attendance.guardsSeen)],
              ['Scans outside the geofence', String(summary.attendance.outsideGeofence)],
              ['Marked flagged for review', String(summary.attendance.flagged)],
              ['Patrol records', String(summary.patrols.total)],
              ['Patrols completed', `${summary.patrols.completed} (${summary.patrols.completionRate}%)`],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="text-zinc-600">{label}</dt><dd className="font-mono font-semibold">{value}</dd></div>)}
          </dl>
        </section>

        <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Money in range</h2><p className="mt-1 text-xs text-zinc-500">Only finance records created between these dates.</p></header>
          <dl className="divide-y divide-zinc-100 text-xs">
            {[
              ['Income', naira(summary.finance.income)],
              ['Costs', naira(summary.finance.costs)],
              ['Profit', naira(summary.finance.profit)],
              ['Income already settled', naira(summary.finance.incomeSettled)],
              ['Still unsettled', naira(summary.finance.unsettled)],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="text-zinc-600">{label}</dt><dd className="font-mono font-semibold">{value}</dd></div>)}
          </dl>
          {summary.finance.costByCategory.length > 0 && <div className="border-t border-zinc-100 p-4"><p className="text-[10px] uppercase tracking-wide text-zinc-500">Where the money went</p><ul className="mt-2 space-y-1.5 text-xs">{summary.finance.costByCategory.map((item) => <li key={item.label} className="flex items-center justify-between gap-3"><span className="capitalize">{item.label}</span><span className="font-mono">{naira(item.amount)}</span></li>)}</ul></div>}
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Download the raw data</h2><p className="mt-1 text-xs text-zinc-500">CSV exports contain every record for your organization; filter them in Excel or Sheets for a different period.</p></header>
        <ul className="divide-y divide-zinc-100">{exports.map((item) => <li key={item.label} className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><b className="text-xs font-semibold">{item.label}</b><p className="mt-0.5 text-[11px] text-zinc-500">{item.detail}</p></div><a href={item.href} className={btn}><Download className="size-3.5" />CSV</a></li>)}</ul>
      </section>
    </>}
  </>
}
