'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, RefreshCw, ShieldAlert } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Badge, Empty, ErrorBanner, Spinner, btn, btnPrimary } from '@/components/ui-bits'
import { api, when } from '@/lib/client'

type Alert = { id: string; type: string; title: string; body: string; severity: string; acknowledged: boolean; createdAt: string }

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** Every alert is created by a rule in the system, never typed by hand. */
const rules = [
  { severity: 'critical', rule: 'SOS pressed in the guard app', source: 'guard app' },
  { severity: 'critical', rule: 'Incident reported or escalated as critical', source: 'incidents' },
  { severity: 'critical', rule: '3 or more geofence breaches by one guard in 24 hours', source: 'attendance' },
  { severity: 'high', rule: 'A guard scans outside their site geofence', source: 'attendance' },
  { severity: 'high', rule: 'An incident is escalated', source: 'incidents' },
]

function sourceOf(type: string) {
  if (type.startsWith('sos')) return { label: 'SOS', href: '/guard-app' }
  if (type.startsWith('geofence')) return { label: 'Attendance', href: '/attendance' }
  if (type.startsWith('incident')) return { label: 'Incidents', href: '/incidents' }
  if (type.startsWith('patrol')) return { label: 'Patrols', href: '/patrols' }
  return { label: 'System', href: '/alerts' }
}

type Filter = 'open' | 'all' | 'critical'

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [showRules, setShowRules] = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await api<Alert[]>('/api/operations?section=alerts')
      setAlerts(rows)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load alerts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer) }, [load])

  async function acknowledge(row: Alert, acknowledged = true) {
    setBusy(row.id)
    try {
      await api('/api/operations', { method: 'PATCH', json: { section: 'alerts', id: row.id, action: 'update', acknowledged } })
      setAlerts((items) => items.map((item) => item.id === row.id ? { ...item, acknowledged } : item))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the alert.')
    } finally {
      setBusy('')
    }
  }

  async function acknowledgeAll() {
    const open = alerts.filter((row) => !row.acknowledged)
    if (!open.length) return
    if (!window.confirm(`Acknowledge ${open.length} alert${open.length === 1 ? '' : 's'}?`)) return
    setBusy('all')
    try {
      await Promise.all(open.map((row) => api('/api/operations', { method: 'PATCH', json: { section: 'alerts', id: row.id, action: 'update', acknowledged: true } })))
      setAlerts((items) => items.map((item) => ({ ...item, acknowledged: true })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to acknowledge every alert.')
    } finally {
      setBusy('')
    }
  }

  const open = alerts.filter((row) => !row.acknowledged)
  const critical = alerts.filter((row) => ['critical', 'high'].includes(row.severity))
  const rows = useMemo(() => {
    const list = filter === 'open' ? open : filter === 'critical' ? critical : alerts
    return [...list].sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || b.createdAt.localeCompare(a.createdAt))
  }, [alerts, filter, open, critical])

  const filters: [Filter, string][] = [['open', `Unacknowledged (${open.length})`], ['critical', `High & critical (${critical.length})`], ['all', `All (${alerts.length})`]]

  return <>
    <PageHeader title="Alerts" subtitle="Raised automatically when a rule fires. Acknowledge an alert once somebody is dealing with it.">
      <button onClick={() => setShowRules(!showRules)} className={btn}><ShieldAlert className="size-3.5" />What raises an alert?</button>
      <button onClick={() => void acknowledgeAll()} disabled={!open.length || busy === 'all'} className={btnPrimary}><Check className="size-3.5" />Acknowledge all</button>
    </PageHeader>

    <StatStrip stats={[[String(open.length), 'Unacknowledged'], [String(alerts.filter((row) => row.severity === 'critical').length), 'Critical'], [String(alerts.filter((row) => row.severity === 'high').length), 'High'], [String(alerts.filter((row) => row.acknowledged).length), 'Acknowledged']]} />

    {showRules && <section className="mb-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">How severity is decided</h2><p className="mt-1 text-xs text-zinc-500">Severity comes from the rule that fired. Nobody types an alert by hand, so the same event always gets the same severity.</p></header>
      <ul className="divide-y divide-zinc-100">{rules.map((rule) => <li key={rule.rule} className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs"><Badge value={rule.severity} /><span className="min-w-0 flex-1">{rule.rule}</span><span className="text-[10px] uppercase tracking-wide text-zinc-500">{rule.source}</span></li>)}</ul>
    </section>}

    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">{filters.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${filter === key ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-zinc-200 bg-white text-zinc-700'}`}>{label}</button>)}</div>
      <button onClick={() => { setLoading(true); void load() }} className={`${btn} ml-auto`}><RefreshCw className="size-3.5" />Refresh</button>
    </div>

    <ErrorBanner message={error} retry={() => void load()} />

    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {loading && !alerts.length ? <Spinner label="Loading alerts…" /> : rows.length === 0 ? <Empty title={filter === 'open' ? 'Nothing needs attention' : 'No alerts yet'} text={filter === 'open' ? 'Every alert has been acknowledged.' : 'Alerts appear here when a guard scans outside a geofence, presses SOS, or an incident is escalated.'} /> : <ul className="divide-y divide-zinc-100">
        {rows.map((row) => {
          const source = sourceOf(row.type)
          return <li key={row.id} className={`flex flex-wrap items-start gap-3 p-4 ${row.acknowledged ? 'opacity-60' : ''}`}>
            <span className="mt-0.5"><Badge value={row.severity} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="mt-0.5 text-xs text-zinc-600">{row.body}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{when(row.createdAt)} · from <Link href={source.href} className="underline">{source.label}</Link></p>
            </div>
            {row.acknowledged
              ? <div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Check className="size-3.5" />Acknowledged</span><button onClick={() => void acknowledge(row, false)} disabled={busy === row.id} className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-semibold">Reopen</button></div>
              : <button onClick={() => void acknowledge(row)} disabled={busy === row.id} className="rounded-lg bg-[#2A2B2E] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60">{busy === row.id ? 'Saving…' : 'Acknowledge'}</button>}
          </li>
        })}
      </ul>}
    </div>

    <p className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500"><Bell className="size-3.5" />Acknowledging only records that a person has seen the alert — it does not resolve the underlying incident or correct the attendance record.</p>
  </>
}
