'use client'

import { useEffect, useState } from 'react'

import { ErrorBanner, Spinner } from '@/components/ui-bits'
import { api } from '@/lib/client'

type SystemInfo = {
  database: { connected: boolean; provider: string; latencyMs: number }
  auth: { provider: string; emailPassword: boolean }
  napoleon: { configured: boolean }
  telemetry: { configured: boolean }
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span aria-hidden className={`size-1.5 rounded-full ${ok ? 'bg-[#16794A]' : 'bg-[#B42318]'}`} />
}

function Row({ label, value, ok, hint }: { label: string; value: string; ok: boolean; hint?: string }) {
  return <div className="grid gap-1 px-5 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-6">
    <p className="text-[12.5px] font-medium text-[#18181B]">{label}</p>
    <div>
      <p className="flex items-center gap-2 text-[12px] text-[#3F3F46]"><StatusDot ok={ok} />{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-[#6B6B72]">{hint}</p>}
    </div>
  </div>
}

export function SystemStatus() {
  const [data, setData] = useState<SystemInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<SystemInfo>('/api/system').then((info) => { setData(info); setError('') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to read system status.'))
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!data) return <section className="ws-card"><Spinner label="Checking integrations…" /></section>

  return <section className="ws-card">
    <header className="border-b border-[#E4E4E7] px-5 py-4">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em]">System status</h2>
      <p className="mt-0.5 text-xs text-[#6B6B72]">Read-only checks for the services this workspace depends on. Credentials are never shown.</p>
    </header>
    <div className="divide-y divide-[#EFEFF1]">
      <Row label="Database" ok={data.database.connected} value={data.database.connected ? `${data.database.provider} · connected · ${data.database.latencyMs} ms` : `${data.database.provider} · not reachable`} hint={`Provider: ${data.database.provider}. All operational records and sign-in accounts live here.`} />
      <Row label="Authentication" ok value={`${data.auth.provider} · email and password`} hint="Accounts are created by an administrator; self sign-up is limited to the first account." />
      <Row label="Napoleon" ok={data.napoleon.configured} value={data.napoleon.configured ? 'Configured' : 'Not configured'} hint="The external analysis service used for Napoleon insights and chat." />
      <Row label="Telemetry queue" ok={data.telemetry.configured} value={data.telemetry.configured ? 'Redis configured' : 'Using the in-process buffer'} hint="Latency telemetry still works without Redis; Redis adds a durable queue and a separate worker." />
    </div>
  </section>
}
