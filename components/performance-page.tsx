'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Empty, ErrorBanner, Spinner, btn } from '@/components/ui-bits'
import { api, when } from '@/lib/client'
import {
  formatMetric,
  metricLabel,
  TELEMETRY_WINDOWS,
  type SummaryRow,
  type TelemetrySummary,
  type TelemetryWindow,
} from '@/lib/telemetry-shared'

const WINDOW_LABELS: Record<TelemetryWindow, string> = { '1h': 'Last hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' }

function Status({ row }: { row: SummaryRow }) {
  if (!row.budget) return <span className="text-[10px] text-zinc-400">No budget</span>
  return row.overBudget
    ? <span className="inline-flex whitespace-nowrap rounded-full bg-[#FDECEA] px-2.5 py-1 text-[10px] font-semibold text-[#B42318]">Over budget</span>
    : <span className="inline-flex whitespace-nowrap rounded-full bg-[#E3F4EA] px-2.5 py-1 text-[10px] font-semibold text-[#16794A]">Within budget</span>
}

function MetricCells({ row }: { row: SummaryRow }) {
  return <>
    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMetric(row.metric, row.p50)}</td>
    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{formatMetric(row.metric, row.p95)}</td>
    <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-500">{formatMetric(row.metric, row.p99)}</td>
    <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-500">{row.budget ? formatMetric(row.metric, row.budget.p95) : '—'}</td>
    <td className="px-4 py-3 text-right"><Status row={row} /></td>
  </>
}

const headCell = 'px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500'
const numericHead = `${headCell} text-right`

export function PerformancePage() {
  const [range, setRange] = useState<TelemetryWindow>('24h')
  const [data, setData] = useState<TelemetrySummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (next: TelemetryWindow) => {
    setBusy(true)
    try {
      const summary = await api<TelemetrySummary>(`/api/telemetry?window=${next}`)
      setData(summary)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load latency data.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load(range)
    const timer = window.setInterval(() => { if (!document.hidden) void load(range) }, 60_000)
    return () => window.clearInterval(timer)
  }, [load, range])

  const overBudget = data ? [...data.screens, ...data.endpoints].filter((row) => row.overBudget).length : 0
  const screensTracked = data ? new Set(data.screens.map((row) => row.key)).size : 0

  return <>
    <PageHeader
      title="Latency"
      subtitle="Real-user timings for key screens and the API endpoints behind them, measured against the committed baseline."
    >
      <div role="group" aria-label="Time window" className="flex rounded-[10px] border border-zinc-200 bg-white p-0.5">
        {TELEMETRY_WINDOWS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setRange(option)}
            aria-pressed={range === option}
            className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-semibold transition-colors ${range === option ? 'bg-[#2A2B2E] text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
          >
            {option}
          </button>
        ))}
      </div>
      <button onClick={() => void load(range)} disabled={busy} className={btn}>
        <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh
      </button>
    </PageHeader>

    <ErrorBanner message={error} retry={() => void load(range)} />

    {data?.baseline.provisional && (
      <p className="mb-4 rounded-[14px] border border-[#F3E3BF] bg-[#FEF8EC] px-4 py-3 text-[11px] text-[#8A6413]">
        <b className="font-semibold">The baseline is provisional.</b> These are target budgets, not measured numbers.
        Run <code className="font-mono">scripts/latency-baseline.ts</code> against a seeded workspace and commit the result.
      </p>
    )}

    <StatStrip stats={[
      [data ? data.total.toLocaleString() : '—', 'Samples in window'],
      [data ? String(screensTracked) : '—', 'Screens reporting'],
      [data ? String(data.endpoints.length) : '—', 'Endpoints reporting'],
      [data ? String(overBudget) : '—', 'Over budget'],
    ]} />

    <section className="mb-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-2 p-4">
        <div>
          <h2 className="text-sm font-semibold">Screens</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Core Web Vitals, page load and in-app route transitions, grouped by screen.</p>
        </div>
        {data && <span className="text-[10px] text-zinc-500">Since {when(data.since)}</span>}
      </div>
      {!data ? <Spinner label="Loading screen timings…" /> : data.screens.length === 0 ? (
        <Empty title="No screen samples yet" text="Open a few pages and they will appear here within a minute." />
      ) : (
        <div className="overflow-x-auto border-t border-zinc-100">
          <table className="w-full min-w-[760px] text-left text-xs">
            <caption className="sr-only">Screen latency percentiles compared with the baseline</caption>
            <thead className="bg-zinc-50"><tr>
              <th className={headCell}>Screen</th>
              <th className={headCell}>Metric</th>
              <th className={numericHead}>Samples</th>
              <th className={numericHead}>p50</th>
              <th className={numericHead}>p95</th>
              <th className={numericHead}>p99</th>
              <th className={numericHead}>Budget p95</th>
              <th className={numericHead}>Status</th>
            </tr></thead>
            <tbody>
              {data.screens.map((row) => (
                <tr key={`${row.key}:${row.metric}`} className="border-t border-zinc-100">
                  <td className="px-4 py-3 font-semibold capitalize">{row.key.replace('-', ' ')}</td>
                  <td className="px-4 py-3 text-zinc-600"><span className="block truncate" title={metricLabel(row.metric)}>{metricLabel(row.metric)}</span></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{row.count.toLocaleString()}</td>
                  <MetricCells row={row} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      <div className="p-4">
        <h2 className="text-sm font-semibold">Endpoints</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Server time for the instrumented API routes, from request to response.</p>
      </div>
      {!data ? <Spinner label="Loading endpoint timings…" /> : data.endpoints.length === 0 ? (
        <Empty title="No endpoint samples yet" text="Timings appear as soon as the instrumented routes are called." />
      ) : (
        <div className="overflow-x-auto border-t border-zinc-100">
          <table className="w-full min-w-[720px] text-left text-xs">
            <caption className="sr-only">API endpoint latency percentiles compared with the baseline</caption>
            <thead className="bg-zinc-50"><tr>
              <th className={headCell}>Endpoint</th>
              <th className={numericHead}>Samples</th>
              <th className={numericHead}>p50</th>
              <th className={numericHead}>p95</th>
              <th className={numericHead}>p99</th>
              <th className={numericHead}>Budget p95</th>
              <th className={numericHead}>Status</th>
            </tr></thead>
            <tbody>
              {data.endpoints.map((row) => (
                <tr key={row.key} className="border-t border-zinc-100">
                  <td className="px-4 py-3"><span className="block max-w-[320px] truncate font-mono text-[11px]" title={row.key}>{row.key}</span></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{row.count.toLocaleString()}</td>
                  <MetricCells row={row} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <p className="mt-4 text-[11px] text-zinc-500">
      Samples come from real page loads (web-vitals) and are attributed to the signed-in organization.
      Anonymous guard-app samples are stored without an organization. See <code className="font-mono">docs/latency-baseline.md</code> for how the baseline is recorded.
    </p>
  </>
}
