'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Spinner, btn, inputClass, smallBtn } from '@/components/ui-bits'
import { api, clearClientCache } from '@/lib/client'

type Patrol = { id: string; date: string; guardName: string; photoUrl: string | null; site: string; checkpoints: Record<string, string>; signedCount: number; status: string }
type Data = { date: string; today: string; slots: string[]; shift: { startHour: number; endHour: number }; rows: Patrol[]; notStarted: { guardId: string; guardName: string; site: string }[]; summary: { completedToday: number; inProgressToday: number; missedToday: number; completedThisMonth: number } }

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : null

function Slots({ patrol, slots }: { patrol: Patrol; slots: string[] }) {
  return <div className="flex w-full gap-1.5 overflow-x-auto pb-1 sm:w-auto sm:pb-0">{slots.map((slot) => { const signed = patrol.checkpoints[slot]; return <span key={slot} title={signed ? `Signed ${time(signed)}` : 'Not signed'} className={`flex min-h-[36px] min-w-[64px] flex-col items-center justify-center rounded-lg border px-2 text-[10px] ${signed ? 'border-[#2A2B2E] bg-[#2A2B2E] text-white' : 'border-[#E4E4E7] bg-white text-[#6B6B72]'}`}><b className="font-mono text-[11px]">{slot}</b><span>{signed ? time(signed) : '—'}</span></span> })}</div>
}

export function PatrolsPage() {
  const [date, setDate] = useState(''); const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { const patrolData = await api<Data>(`/api/patrols${date ? `?date=${date}` : ''}`); setData(patrolData); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load patrols.') } finally { setLoading(false) }
  }, [date])
  useEffect(() => { setLoading(true); void load(); const timer = window.setInterval(() => { if (!document.hidden) void load() }, 60000); return () => window.clearInterval(timer) }, [load])
  function shiftDate(days: number) {
    const base = new Date(`${date || data?.today || new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    base.setUTCDate(base.getUTCDate() + days)
    setDate(base.toISOString().slice(0, 10))
  }
  const s = data?.summary
  return <>
    <PageHeader title="Patrols" subtitle={data ? `Every hour from ${data.slots[0] ?? '08:00'} to ${data.slots[data.slots.length - 1] ?? '17:00'} (Lagos time). ${data.slots.length} signatures complete a patrol.` : 'Hourly checkpoints inside your shift.'} />
    <StatStrip stats={[[String(s?.completedToday ?? '—'), 'Completed today'], [String(s?.inProgressToday ?? '—'), 'In progress'], [String(s?.missedToday ?? '—'), 'Missed today'], [String(s?.completedThisMonth ?? '—'), 'Completed this month']]} />
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous day" className={smallBtn} onClick={() => shiftDate(-1)}><ChevronLeft className="size-4" /></button>
        <input type="date" aria-label="Patrol date" value={date || data?.today || ''} max={data?.today} onChange={(e) => setDate(e.target.value)} className={`${inputClass.replace("w-full", "w-auto")}`} />
        <button type="button" aria-label="Next day" className={smallBtn} onClick={() => shiftDate(1)} disabled={(date || data?.today || '') >= (data?.today ?? '')}><ChevronRight className="size-4" /></button>
      </div>
      <button className={btn} onClick={() => { clearClientCache(); setLoading(true); void load() }}><RefreshCw className="size-3.5" />Refresh</button>
      <a href="/api/export?section=patrols" className={btn}><Download className="size-3.5" />Export CSV</a>
    </div>
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="overflow-hidden ws-card">
      {loading && !data ? <Spinner label="Loading patrols…" /> : !data || (data.rows.length === 0 && data.notStarted.length === 0) ? <Empty title="No patrols on this date" text="Patrols appear when a guard signs a checkpoint in the guard app." /> : <ul className="divide-y divide-[#EFEFF1]">
        {data.rows.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex min-w-[180px] flex-1 items-center gap-3"><Avatar name={p.guardName} src={p.photoUrl} /><span className="text-xs"><b className="block text-sm font-semibold">{p.guardName}</b><span className="text-[#6B6B72]">{p.site}</span></span></div>
          <Slots patrol={p} slots={data.slots} />
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:min-w-[170px] sm:justify-end">
            <div className="w-24"><div className="flex justify-between text-[10px] text-[#6B6B72]"><span className="font-mono tabular-nums">{p.signedCount}/{data.slots.length}</span><span className="font-mono tabular-nums">{Math.round((p.signedCount / Math.max(data.slots.length, 1)) * 100)}%</span></div><div className="mt-1 h-1.5 rounded-full bg-[#EFEFF1]"><div className="h-1.5 rounded-full bg-[#2A2B2E]" style={{ width: `${Math.round((p.signedCount / Math.max(data.slots.length, 1)) * 100)}%` }} /></div></div>
            <Badge value={p.status === 'completed' ? 'completed' : p.status} />
          </div>
        </li>)}
        {data.notStarted.map((g) => <li key={g.guardId} className="flex flex-wrap items-center gap-3 p-4 text-xs"><div className="flex min-w-[180px] flex-1 items-center gap-3"><Avatar name={g.guardName} /><span><b className="block text-sm font-semibold">{g.guardName}</b><span className="text-[#6B6B72]">{g.site}</span></span></div><span className="text-[#6B6B72]">No checkpoint signed yet today</span><Badge value="pending" /></li>)}
      </ul>}
    </div>
  </>
}
