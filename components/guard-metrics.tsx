'use client'

import { useEffect, useState } from 'react'
import { Avatar, ErrorBanner, Sheet, Spinner, inputClass } from '@/components/ui-bits'
import { api, when } from '@/lib/client'

type Metrics = { guard: { id: string; name: string; site: string | null; status: string; lastCheckIn: string | null }; period: string; slots: string[]; attendance: { expected: number; present: number; absent: number; percent: number | null }; patrols: { due: number; completed: number; missed: number; percent: number | null }; outsideGeofence: number; days: { date: string; present: boolean; outside: boolean; signed: number; windowClosed: boolean }[] }

function Meter({ label, percent, line }: { label: string; percent: number | null; line: string }) {
  return <div className="rounded-xl border border-zinc-200 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-mono text-3xl font-semibold">{percent === null ? '—' : `${percent}%`}</p><div className="mt-2 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-[#2A2B2E]" style={{ width: `${percent ?? 0}%` }} /></div><p className="mt-2 text-[11px] text-zinc-500">{line}</p></div>
}

/** One guard's personal numbers: attendance %, patrol %, geofence breaches and a day-by-day strip. */
export function GuardMetrics({ guard, photoUrl, close }: { guard: { id: string; name: string; site?: string | null }; photoUrl?: string | null; close: () => void }) {
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7))
  const [data, setData] = useState<Metrics | null>(null); const [error, setError] = useState('')
  useEffect(() => { setData(null); api<Metrics>(`/api/guards/${guard.id}?period=${period}`).then((d) => { setData(d); setError('') }).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load.')) }, [guard.id, period])
  return <Sheet title={guard.name} kicker="GUARD PERFORMANCE" onClose={close}>
    <div className="mb-4 flex items-center gap-3"><Avatar name={guard.name} src={photoUrl} size={44} /><div className="flex-1 text-xs text-zinc-500">{guard.site ?? 'Unassigned'}{data?.guard.lastCheckIn && <> · last check-in {when(data.guard.lastCheckIn)}</>}</div>
      <input type="month" aria-label="Month" value={period} max={new Date().toLocaleDateString('en-CA').slice(0, 7)} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={`${inputClass.replace('w-full', 'w-auto')}`} /></div>
    <ErrorBanner message={error} />
    {!data && !error ? <Spinner /> : data && <MetricsBody data={data} />}
  </Sheet>
}

function MetricsBody({ data }: { data: Metrics }) {
  const total = data.slots.length || 1
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <Meter label="Attendance" percent={data.attendance.percent} line={`${data.attendance.present} of ${data.attendance.expected} days present · ${data.attendance.absent} absent`} />
      <Meter label="Patrols completed" percent={data.patrols.percent} line={data.patrols.due ? `${data.patrols.completed} of ${data.patrols.due} patrols finished (all ${total} checkpoints) · ${data.patrols.missed} missed` : 'No patrol window has closed yet this period'} />
    </div>
    <p className="mt-3 text-xs text-zinc-600">{data.outsideGeofence} check-in{data.outsideGeofence === 1 ? '' : 's'} outside the site geofence in {data.period}.</p>
    <h3 className="mb-2 mt-5 text-xs font-semibold tracking-wide text-zinc-500">DAY BY DAY</h3>
    <div className="grid grid-cols-7 gap-1.5">{data.days.map((d) => <div key={d.date} title={`${d.date}: ${d.present ? 'present' : 'absent'}${d.outside ? ' (outside geofence)' : ''}, ${d.signed}/${total} checkpoints`} className={`flex h-14 flex-col items-center justify-center rounded-lg border text-[10px] ${d.present ? 'border-[#16794A]/30 bg-[#E3F4EA] text-[#16794A]' : d.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) ? 'border-zinc-200 bg-white text-zinc-500' : 'border-[#B42318]/30 bg-[#FDECEA] text-[#B42318]'}`}><b className="font-mono text-xs">{Number(d.date.slice(8))}</b><span>{d.signed}/{total}</span></div>)}</div>
    <p className="mt-2 text-[11px] text-zinc-500">Green is a day with a check-in, red a day without one. The small number is checkpoints signed that day, out of {total}. Checkpoints follow the shift set in Settings ({data.slots[0] ?? '—'}–{data.slots[data.slots.length - 1] ?? '—'}).</p>
  </>
}
