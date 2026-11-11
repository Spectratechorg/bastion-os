'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Avatar, Badge, Empty, ErrorBanner, Spinner, btn, smallBtn } from '@/components/ui-bits'
import { api } from '@/lib/client'

type Patrol = {
  id: string; date: string; guardId: string; guardName: string; photoUrl: string | null; site: string
  checkpoints: Record<string, string>; signedCount: number; status: string; missedSlots: string[]
  shift: { startHour: number; endHour: number }; slots: string[]
}
type Data = {
  date: string; today: string; rows: Patrol[]
  summary: { completed: number; inProgress: number; missed: number; total: number; completedThisMonth: number }
}

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : null
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const dayLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Today'

function Summary({ value, label, tone }: { value: string; label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }) {
  const dot = tone === 'green' ? 'bg-[#16794A]' : tone === 'amber' ? 'bg-[#B7791F]' : tone === 'red' ? 'bg-[#B42318]' : 'bg-[#9A9AA1]'
  return <div className="rounded-[12px] border border-[#E4E4E7] bg-white p-3.5">
    <div className="flex items-center gap-2 text-[10.5px] text-[#6B6B72]"><span className={`size-1.5 rounded-full ${dot}`} />{label}</div>
    <p className="mt-1.5 text-[23px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#18181B]">{value}</p>
  </div>
}

function Slots({ patrol }: { patrol: Patrol }) {
  return <div className="grid grid-cols-5 gap-1.5 sm:flex sm:overflow-x-auto sm:pb-1">
    {patrol.slots.map((slot) => {
      const signed = patrol.checkpoints[slot]
      const missed = !signed && patrol.missedSlots.includes(slot)
      const state = signed ? 'signed' : missed ? 'missed' : 'pending'
      const tone = state === 'signed' ? 'border-[#CFE3D3] bg-[#EFF7F0] text-[#2F6B49]' : state === 'missed' ? 'border-[#F0C7C1] bg-[#FDECEA] text-[#B42318]' : 'border-[#E4E4E7] bg-[#FAFAFA] text-[#8A938B]'
      const bar = state === 'signed' ? 'bg-[#16794A]' : state === 'missed' ? 'bg-[#D14343]' : 'bg-[#D4D4D8]'
      return <div key={slot} title={signed ? `${slot} · signed ${time(signed)}` : missed ? `${slot} · missed` : `${slot} · pending`} className={`flex min-w-0 flex-1 flex-col items-center rounded-[8px] border px-1 py-2 sm:min-w-[46px] ${tone}`}>
        <span className="font-mono text-[9.5px] font-semibold">{slot}</span>
        <span className={`mt-1.5 h-1 w-full rounded-full ${bar}`} />
        <span className="mt-1 whitespace-nowrap text-[8.5px]">{signed ? time(signed) : missed ? 'Missed' : 'Pending'}</span>
      </div>
    })}
  </div>
}

function overall(status: string) {
  if (status === 'completed') return 'Patrol Completed'
  if (status === 'missed') return 'Not Completed'
  if (status === 'suspended') return 'Suspended'
  return 'In progress'
}

export function PatrolsPage() {
  const [date, setDate] = useState('')
  const patrolsQuery = useQuery({ queryKey: ['patrols', date], queryFn: () => api<Data>(`/api/patrols${date ? `?date=${date}` : ''}`), refetchInterval: 60_000 })
  const data = patrolsQuery.data ?? null
  const error = patrolsQuery.error instanceof Error ? patrolsQuery.error.message : ''
  const loading = patrolsQuery.isLoading || patrolsQuery.isFetching
  const load = async () => { await patrolsQuery.refetch() }
  function shiftDate(days: number) {
    const base = new Date(`${date || data?.today || new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    base.setUTCDate(base.getUTCDate() + days)
    setDate(base.toISOString().slice(0, 10))
  }
  const s = data?.summary
  const shownDate = date || data?.today || ''
  return <>
    <PageHeader
      title="Patrols"
      subtitle={`${dayLabel(shownDate)} · Every guard, their own shift, and every scheduled checkpoint for the day.`}
      action={<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div className="flex h-10 w-full items-center rounded-[8px] border border-[#E4E4E7] bg-white px-1 sm:w-auto">
          <button type="button" aria-label="Previous day" className={smallBtn} onClick={() => shiftDate(-1)}><ChevronLeft className="size-4" /></button>
          <input type="date" aria-label="Patrol date" value={shownDate} max={data?.today} onChange={(e) => setDate(e.target.value)} className="h-8 w-[128px] border-0 bg-transparent px-1 text-xs text-[#3F3F46] outline-none" />
          <button type="button" aria-label="Next day" className={smallBtn} onClick={() => shiftDate(1)} disabled={shownDate >= (data?.today ?? '')}><ChevronRight className="size-4" /></button>
        </div>
        <a href="/api/export?section=patrols" className={`${btn} flex-1 justify-center sm:flex-none`}><Download className="size-3.5" />Export CSV</a>
      </div>}
    />

    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Summary value={String(s?.completed ?? '—')} label="Completed" tone="green" />
      <Summary value={String(s?.inProgress ?? '—')} label="In progress" tone="amber" />
      <Summary value={String(s?.missed ?? '—')} label="Not completed" tone="red" />
      <Summary value={String(s?.total ?? '—')} label="Guards on date" tone="neutral" />
    </section>

    <ErrorBanner message={error} retry={() => void load()} />

    {loading && !data ? <div className="ws-card"><Spinner label="Loading patrols…" /></div> : !data || data.rows.length === 0 ? <div className="ws-card"><Empty title="No guards on this date" text="Register guards to build the daily patrol board." /></div> : <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] text-[#8A938B]">{data.rows.length} guard{data.rows.length === 1 ? '' : 's'} · checkpoints update as guards sign in</p>
        <div className="flex items-center gap-3 text-[10px] text-[#8A938B]">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#16794A]" />Signed</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#D14343]" />Missed</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#D4D4D8]" />Pending</span>
        </div>
      </div>
      <ul className="space-y-3">
      {data.rows.map((p) => {
        const pct = Math.round((p.signedCount / Math.max(p.slots.length, 1)) * 100)
        return <li key={p.id} className="ws-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={p.guardName} src={p.photoUrl} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#18181B]">{p.guardName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B6B72]">
                  <span className="truncate">{p.site}</span>
                  <span className="rounded-full bg-[#F5F5F6] px-1.5 py-0.5 text-[9.5px]">Shift {hourLabel(p.shift.startHour)}–{hourLabel(p.shift.endHour)}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right"><p className="text-[13px] font-semibold tabular-nums text-[#18181B]">{p.signedCount}<span className="text-[#8A938B]">/{p.slots.length}</span></p><p className="text-[10px] text-[#8A938B]">{pct}% signed</p></div>
              <Badge value={overall(p.status)} />
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#8A938B]">Checkpoint timeline</p>
            <Slots patrol={p} />
          </div>

        </li>
      })}
      </ul>
    </>}
  </>
}
