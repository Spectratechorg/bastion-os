'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ErrorBanner, Field, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api } from '@/lib/client'

const hours = Array.from({ length: 25 }, (_, hour) => hour)
const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`
type GuardRow = { id: string; name: string; site: string | null; status: string; shiftStartHour: number | null; shiftEndHour: number | null }

/** Settings tab: the shared guard app code and the hourly patrol shift. */
export function GuardAppSettings() {
  const [shift, setShift] = useState({ startHour: 8, endHour: 18 })
  const [guards, setGuards] = useState<GuardRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, { startHour: number | null; endHour: number | null }>>({})
  const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [savingGuard, setSavingGuard] = useState('')
  const load = useCallback(async () => {
    try {
      const [current, guardRows] = await Promise.all([
        api<{ startHour: number; endHour: number }>('/api/shift'),
        api<GuardRow[]>('/api/operations?section=guards'),
      ])
      setShift({ startHour: current.startHour, endHour: current.endHour })
      setGuards(guardRows)
      setDrafts(Object.fromEntries(guardRows.map((guard) => [guard.id, { startHour: guard.shiftStartHour, endHour: guard.shiftEndHour }])))
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the guard app settings.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function saveGuardShift(guard: GuardRow) {
    const draft = drafts[guard.id]
    if (!draft) return
    setSavingGuard(guard.id); setNote('')
    try {
      const updated = await api<GuardRow>('/api/operations', { method: 'PATCH', json: {
        section: 'guards', id: guard.id, action: 'update',
        shiftStartHour: draft.startHour, shiftEndHour: draft.endHour,
      } })
      setGuards((rows) => rows.map((row) => row.id === guard.id ? { ...row, ...updated } : row))
      setDrafts((current) => ({ ...current, [guard.id]: { startHour: updated.shiftStartHour, endHour: updated.shiftEndHour } }))
      setNote(`${guard.name}'s patrol schedule updated.`); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this guard’s shift.') } finally { setSavingGuard('') }
  }

  async function saveShift(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNote('')
    try { const next = await api<{ startHour: number; endHour: number }>('/api/shift', { method: 'POST', json: shift }); setShift(next); setNote('Patrol checkpoints updated.'); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the patrol shift.') } finally { setBusy(false) }
  }

  return <div className="grid gap-4">
    <ErrorBanner message={error} retry={() => void load()} />
    <section className="ws-card p-5">
      <h2 className="text-[15px] font-semibold">Patrol shift</h2>
      <p className="mt-0.5 text-xs text-[#6B6B72]">Guards sign one checkpoint every hour inside this shift, in Lagos time. This shift has {shift.endHour > shift.startHour ? shift.endHour - shift.startHour : 24 - shift.startHour + shift.endHour} checkpoints ({label(shift.startHour)} to {label(Math.max(shift.endHour - 1, 0))}). A patrol that misses any checkpoint raises a missed-patrol alert once the shift ends.</p>
      <form onSubmit={saveShift} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Shift starts"><select className={inputClass} value={shift.startHour} onChange={(event) => setShift({ ...shift, startHour: Number(event.target.value) })}>{hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></Field>
        <Field label="Shift ends"><select className={inputClass} value={shift.endHour} onChange={(event) => setShift({ ...shift, endHour: Number(event.target.value) })}>{hours.slice(1).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></Field>
        <button className={btnPrimary} disabled={busy}>Save shift</button>
      </form>
      {note && <p role="status" className="mt-3 text-xs text-emerald-700">{note}</p>}
    </section>

    <section className="ws-card">
      <header className="border-b border-[#E4E4E7] px-5 py-4"><h2 className="text-[15px] font-semibold">Guard patrol shifts</h2><p className="mt-0.5 text-xs text-[#6B6B72]">Give each guard their own hourly patrol window. Guards without an override use the company shift above. The Patrols page and the guard app both read this schedule.</p></header>
      {guards.length === 0 ? <div className="p-5"><Spinner /></div> : <ul className="divide-y divide-[#EFEFF1]">
        {guards.map((guard) => {
          const draft = drafts[guard.id] ?? { startHour: guard.shiftStartHour, endHour: guard.shiftEndHour }
          const custom = draft.startHour !== null && draft.endHour !== null
          return <li key={guard.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-[12.5px] font-medium text-[#18181B]">{guard.name}</p><p className="mt-0.5 text-[11px] text-[#6B6B72]">{guard.site ?? 'Unassigned'}{guard.status === 'suspended' ? ' · suspended' : ''}</p></div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[10px] font-medium text-[#6B6B72]">Starts<select aria-label={`${guard.name} shift start`} className={`${inputClass} mt-1 h-9 w-[104px]`} value={draft.startHour ?? ''} onChange={(event) => setDrafts((current) => { const nextStart = event.target.value === '' ? null : Number(event.target.value); let nextEnd = event.target.value === '' ? null : (draft.endHour ?? shift.endHour); if (nextStart !== null && nextEnd === nextStart) nextEnd = nextStart === 23 ? 24 : nextStart + 1; return { ...current, [guard.id]: { startHour: nextStart, endHour: nextEnd } } })}><option value="">Company default</option>{hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></label>
              <label className="text-[10px] font-medium text-[#6B6B72]">Ends<select aria-label={`${guard.name} shift end`} disabled={!custom} className={`${inputClass} mt-1 h-9 w-[118px]`} value={draft.endHour ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [guard.id]: { ...draft, endHour: event.target.value === '' ? null : Number(event.target.value) } }))}><option value="">Company default</option>{hours.slice(1).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></label>
              <button type="button" className={smallBtn} disabled={savingGuard === guard.id} onClick={() => void saveGuardShift(guard)}>{savingGuard === guard.id ? 'Saving…' : 'Save'}</button>
            </div>
          </li>
        })}
      </ul>}
    </section>
  </div>
}
