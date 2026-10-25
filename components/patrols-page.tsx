'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Check, Download, RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Spinner, btn, inputClass } from '@/components/ui-bits'
import { api } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((module) => module.LiveMap), { ssr: false, loading: () => <div className="h-80 animate-pulse bg-zinc-100" /> })
type Patrol = { id: string; date: string; guardName: string; photoUrl: string | null; site: string; checkpoints: Record<string, string>; signedCount: number; status: string }
type Data = { date: string; today: string; slots: string[]; shift: { startHour: number; endHour: number }; rows: Patrol[]; notStarted: { guardId: string; guardName: string; site: string }[]; summary: { completedToday: number; inProgressToday: number; missedToday: number; completedThisMonth: number } }

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : null

function Slots({ patrol, slots }: { patrol: Patrol; slots: string[] }) {
  return <span className="flex gap-1.5">{slots.map((slot) => { const signed = patrol.checkpoints[slot]; return <span key={slot} title={signed ? `Signed ${time(signed)}` : 'Not signed'} className={`flex min-h-[36px] min-w-[64px] flex-col items-center justify-center rounded-lg border px-2 text-[10px] ${signed ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-zinc-200 bg-white text-zinc-500'}`}><b className="font-mono text-[11px]">{slot}</b><span>{signed ? time(signed) : '—'}</span></span> })}</span>
}

export function PatrolsPage() {
  const [date, setDate] = useState(''); const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [sites, setSites] = useState<Record<string, unknown>[]>([]); const [guards, setGuards] = useState<Record<string, unknown>[]>([])
  const load = useCallback(async () => {
    try { const [patrolData, siteRows, guardRows] = await Promise.all([api<Data>(`/api/patrols${date ? `?date=${date}` : ''}`), api<Record<string, unknown>[]>('/api/operations?section=sites'), api<Record<string, unknown>[]>('/api/operations?section=guards')]); setData(patrolData); setSites(siteRows); setGuards(guardRows); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load patrols.') } finally { setLoading(false) }
  }, [date])
  useEffect(() => { setLoading(true); void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer) }, [load])
  const s = data?.summary
  return <>
    <PageHeader title="Patrols" subtitle={data ? `Every hour from ${data.slots[0] ?? '08:00'} to ${data.slots[data.slots.length - 1] ?? '17:00'} (Lagos time). ${data.slots.length} signatures complete a patrol.` : 'Hourly checkpoints inside your shift.'} />
    <StatStrip stats={[[String(s?.completedToday ?? '—'), 'Completed today'], [String(s?.inProgressToday ?? '—'), 'In progress'], [String(s?.missedToday ?? '—'), 'Missed today'], [String(s?.completedThisMonth ?? '—'), 'Completed this month']]} />
    <StatStrip stats={[[String(s?.completedToday ?? '—'), 'Completed today'], [String(s?.missedToday ?? '—'), 'Missed today'], [String(s?.completedThisMonth ?? '—'), 'Completed this month'], [String(s?.completedToday ?? '—'), 'Routes today']]} />
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input type="date" aria-label="Patrol date" value={date || data?.today || ''} max={data?.today} onChange={(e) => setDate(e.target.value)} className={`${inputClass.replace("w-full", "w-auto")}`} />
      <button className={btn} onClick={() => { setLoading(true); void load() }}><RefreshCw className="size-3.5" />Refresh</button>
      <a href="/api/export?section=patrols" className={btn}><Download className="size-3.5" />Export CSV</a>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="mb-4 overflow-hidden rounded-[18px] border border-zinc-200 bg-white"><div className="border-b border-zinc-100 p-4"><h2 className="text-sm font-semibold">Guard locations</h2><p className="mt-1 text-[11px] text-zinc-500">Profile pins show each guard&apos;s latest check-in on the standard map.</p></div><LiveMap sites={sites as never} guards={guards as never} height="h-80 sm:h-96" /></div>
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
