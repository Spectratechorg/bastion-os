'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Download, RefreshCw, Smartphone } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Spinner, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { api } from '@/lib/client'

type Patrol = { id: string; date: string; guardName: string; photoUrl: string | null; site: string; checkpoints: Record<string, string>; signedCount: number; status: string }
type Data = { date: string; today: string; slots: string[]; rows: Patrol[]; notStarted: { guardId: string; guardName: string; site: string }[]; summary: { completedToday: number; inProgressToday: number; missedToday: number; completedThisMonth: number } }

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : null

function Slots({ patrol, slots }: { patrol: Patrol; slots: string[] }) {
  return <span className="flex gap-1.5">{slots.map((slot) => { const signed = patrol.checkpoints[slot]; return <span key={slot} title={signed ? `Signed ${time(signed)}` : 'Not signed'} className={`flex min-h-[36px] min-w-[64px] flex-col items-center justify-center rounded-lg border px-2 text-[10px] ${signed ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-zinc-200 bg-white text-zinc-500'}`}><b className="font-mono text-[11px]">{slot}</b><span>{signed ? time(signed) : '—'}</span></span> })}</span>
}

export function PatrolsPage() {
  const [date, setDate] = useState(''); const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/patrols${date ? `?date=${date}` : ''}`)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load patrols.') } finally { setLoading(false) }
  }, [date])
  useEffect(() => { setLoading(true); void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer) }, [load])
  const s = data?.summary
  return <>
    <PageHeader title="Patrols" subtitle="Each guard signs 10:00, 11:00 and 12:00 between 09:00 and 12:59. All three signatures complete the patrol.">
      <Link href="/guard-app" className={btnPrimary}><Smartphone className="size-4" />Open guard app</Link>
    </PageHeader>
    <StatStrip stats={[[String(s?.completedToday ?? '—'), 'Completed today'], [String(s?.inProgressToday ?? '—'), 'In progress'], [String(s?.missedToday ?? '—'), 'Missed today'], [String(s?.completedThisMonth ?? '—'), 'Completed this month']]} />
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input type="date" aria-label="Patrol date" value={date || data?.today || ''} max={data?.today} onChange={(e) => setDate(e.target.value)} className={`${inputClass.replace("w-full", "w-auto")}`} />
      <button className={btn} onClick={() => { setLoading(true); void load() }}><RefreshCw className="size-3.5" />Refresh</button>
      <a href="/api/export?section=patrols" className={btn}><Download className="size-3.5" />Export CSV</a>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {loading && !data ? <Spinner label="Loading patrols…" /> : !data || (data.rows.length === 0 && data.notStarted.length === 0) ? <Empty title="No patrols on this date" text="Patrols appear when a guard signs a checkpoint in the guard app." /> : <ul className="divide-y divide-zinc-100">
        {data.rows.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex min-w-[180px] flex-1 items-center gap-3"><Avatar name={p.guardName} src={p.photoUrl} /><span className="text-xs"><b className="block text-sm font-semibold">{p.guardName}</b><span className="text-zinc-500">{p.site}</span></span></div>
          <Slots patrol={p} slots={data.slots} />
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:min-w-[150px] sm:justify-end"><span className="font-mono text-xs">{p.signedCount} of {data.slots.length}</span><Badge value={p.status === 'completed' ? 'completed' : p.status} />{p.status === 'completed' && <Check className="size-4 text-[#16794A]" />}</div>
        </li>)}
        {data.notStarted.map((g) => <li key={g.guardId} className="flex flex-wrap items-center gap-3 p-4 text-xs"><div className="flex min-w-[180px] flex-1 items-center gap-3"><Avatar name={g.guardName} /><span><b className="block text-sm font-semibold">{g.guardName}</b><span className="text-zinc-500">{g.site}</span></span></div><span className="text-zinc-500">No checkpoint signed yet today</span><Badge value="pending" /></li>)}
      </ul>}
    </div>
  </>
}
