'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { ErrorBanner, Field, btn, btnPrimary, inputClass } from '@/components/ui-bits'
import { api } from '@/lib/client'

const hours = Array.from({ length: 25 }, (_, hour) => hour)
const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** Settings tab: the shared guard app code and the hourly patrol shift. */
export function GuardAppSettings() {
  const [code, setCode] = useState(''); const [shift, setShift] = useState({ startHour: 8, endHour: 18 })
  const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const [access, current] = await Promise.all([api<{ code: string | null }>('/api/guard/access'), api<{ startHour: number; endHour: number }>('/api/shift')])
      setCode(access.code ?? ''); setShift({ startHour: current.startHour, endHour: current.endHour }); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the guard app settings.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function rotate() {
    if (!window.confirm('Replace the guard app code? Every phone using the old code will stop working.')) return
    setBusy(true); setNote('')
    try { const next = await api<{ code: string }>('/api/guard/access', { method: 'POST', json: {} }); setCode(next.code); setNote('New code created. Give it to your supervisors.'); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to replace the code.') } finally { setBusy(false) }
  }
  async function saveShift(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNote('')
    try { const next = await api<{ startHour: number; endHour: number }>('/api/shift', { method: 'POST', json: shift }); setShift(next); setNote('Patrol checkpoints updated.'); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the patrol shift.') } finally { setBusy(false) }
  }

  return <div className="grid gap-4">
    <ErrorBanner message={error} retry={() => void load()} />
    <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
      <h2 className="text-[15px] font-semibold">Guard app code</h2>
      <p className="mt-0.5 text-xs text-zinc-500">Guard phones enter this code once at <span className="font-mono">/guard-app</span>, so nobody needs a manager login on the phone.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm font-semibold tracking-wider">{code || '—'}</code>
        <button type="button" className={btn} disabled={!code} onClick={() => void navigator.clipboard.writeText(code)}><Copy className="size-3.5" />Copy code</button>
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void rotate()}><RefreshCw className="size-3.5" />{busy ? 'Working…' : 'Replace code'}</button>
      </div>
    </section>
    <section className="rounded-[18px] border border-zinc-200 bg-white p-5">
      <h2 className="text-[15px] font-semibold">Patrol shift</h2>
      <p className="mt-0.5 text-xs text-zinc-500">Guards sign one checkpoint every hour inside this shift, in Lagos time. This shift has {Math.max(shift.endHour - shift.startHour, 0)} checkpoints ({label(shift.startHour)} to {label(Math.max(shift.endHour - 1, 0))}). A patrol that misses any checkpoint raises a missed-patrol alert once the shift ends.</p>
      <form onSubmit={saveShift} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Shift starts"><select className={inputClass} value={shift.startHour} onChange={(event) => setShift({ ...shift, startHour: Number(event.target.value) })}>{hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></Field>
        <Field label="Shift ends"><select className={inputClass} value={shift.endHour} onChange={(event) => setShift({ ...shift, endHour: Number(event.target.value) })}>{hours.slice(1).map((hour) => <option key={hour} value={hour}>{label(hour)}</option>)}</select></Field>
        <button className={btnPrimary} disabled={busy}>Save shift</button>
      </form>
      {note && <p role="status" className="mt-3 text-xs text-emerald-700">{note}</p>}
    </section>
  </div>
}
