import { NextResponse } from 'next/server'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { actor, denyGuard, fail, lagosParts, normalizeShift, patrolSlots } from '@/lib/server'
import { monthBounds } from '@/lib/payroll'

export const dynamic = 'force-dynamic'

/** One guard's own numbers for a month: attendance %, patrol %, geofence breaches and a day-by-day strip. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const current = await actor(); if (!current) return fail('Sign in first.', 401); { const denied = denyGuard(current); if (denied) return denied }
  const { id } = await ctx.params; if (!z.string().uuid().safeParse(id).success) return fail('Invalid guard')
  const now = lagosParts()
  const orgRow = await pool.query('select patrol_start_hour, patrol_end_hour from organization where id = $1', [current.organizationId])
  const shift = normalizeShift(orgRow.rows[0]?.patrol_start_hour, orgRow.rows[0]?.patrol_end_hour)
  const slots = patrolSlots(shift)
  const slotCount = slots.length
  const period = new URL(request.url).searchParams.get('period') ?? now.month
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('Period must look like 2026-10')
  const g = await pool.query('select id, name, site, status, created_at, last_check_in from guards where id = $1 and organization_id = $2', [id, current.organizationId])
  const guard = g.rows[0]; if (!guard) return fail('Guard not found', 404)
  const { daysInMonth } = monthBounds(period)
  const first = `${period}-01`; const last = `${period}-${String(daysInMonth).padStart(2, '0')}`
  const created = lagosParts(guard.created_at).date
  const start = created > first ? created : first
  const upTo = now.date < last ? now.date : last
  const [att, pat] = await Promise.all([
    pool.query(`select to_char(checked_in_at at time zone 'Africa/Lagos','YYYY-MM-DD') d, bool_and(within_geofence) inside from attendance where guard_id = $1 and organization_id = $2 and checked_in_at >= $3::date - 1 and checked_in_at < ($4::date + 2) group by 1`, [id, current.organizationId, first, last]),
    pool.query(`select p.patrol_date d, count(c.id)::int signed from patrols p left join patrol_checkpoints c on c.patrol_id = p.id where p.guard_id = $1 and p.organization_id = $2 and p.patrol_date between $3 and $4 group by p.id, p.patrol_date`, [id, current.organizationId, first, last]),
  ])
  const present = new Map(att.rows.filter((r) => r.d >= first && r.d <= last).map((r) => [r.d as string, r.inside as boolean]))
  const signed = new Map<string, number>(); for (const r of pat.rows) signed.set(r.d, Math.max(signed.get(r.d) ?? 0, r.signed))
  const days: { date: string; present: boolean; outside: boolean; signed: number; windowClosed: boolean; counted: boolean }[] = []
  for (let d = Number(start.slice(8)); start <= upTo && d <= Number(upTo.slice(8)); d++) {
    const date = `${period}-${String(d).padStart(2, '0')}`
    days.push({ date, present: present.has(date), outside: present.get(date) === false, signed: signed.get(date) ?? 0, windowClosed: date < now.date || (date === now.date && now.hour >= shift.endHour), counted: true })
  }
  const expected = days.length; const daysPresent = days.filter((x) => x.present).length
  const due = days.filter((x) => x.windowClosed); const completed = due.filter((x) => x.signed >= slotCount).length
  return NextResponse.json({
    guard: { id: guard.id, name: guard.name, site: guard.site, status: guard.status, lastCheckIn: guard.last_check_in }, period, slots,
    attendance: { expected, present: daysPresent, absent: expected - daysPresent, percent: expected ? Math.round((daysPresent / expected) * 100) : null },
    patrols: { due: due.length, completed, missed: due.length - completed, percent: due.length ? Math.round((completed / due.length) * 100) : null },
    outsideGeofence: days.filter((x) => x.outside).length, days: days.slice(-31),
  })
}
