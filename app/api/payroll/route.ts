import { NextResponse } from 'next/server'
import { and, eq, gte, lt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { activityEvents, attendance, guards, payrollRecords } from '@/lib/db/schema'
import { actor, fail, isModerator, lagosParts } from '@/lib/server'
import { computePayroll, monthBounds } from '@/lib/payroll'

export const dynamic = 'force-dynamic'
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const dayKey = (date: Date) => lagosParts(date).date

/** Returns payroll for a month. Unpaid rows are recalculated from attendance; paid rows are frozen. */
export async function GET(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization to view payroll.', 401)
  const period = periodSchema.safeParse(new URL(request.url).searchParams.get('period') ?? lagosParts().month)
  if (!period.success) return fail('Period must look like 2026-10')
  const { year, month, daysInMonth } = monthBounds(period.data)
  const first = `${period.data}-01`
  const lastDay = `${period.data}-${String(daysInMonth).padStart(2, '0')}`
  const today = lagosParts().date
  const upTo = today < lastDay ? today : lastDay
  const from = new Date(Date.UTC(year, month - 1, 1) - 3600000)
  const to = new Date(Date.UTC(year, month, 1))
  const [guardRows, attendanceRows, existing] = await Promise.all([
    db.select().from(guards).where(eq(guards.organizationId, current.organizationId)),
    db.select({ guardId: attendance.guardId, at: attendance.checkedInAt }).from(attendance).where(and(eq(attendance.organizationId, current.organizationId), gte(attendance.checkedInAt, from), lt(attendance.checkedInAt, to))),
    db.select().from(payrollRecords).where(and(eq(payrollRecords.organizationId, current.organizationId), eq(payrollRecords.period, period.data))),
  ])
  const presentDays = new Map<string, Set<string>>()
  for (const row of attendanceRows) {
    const key = dayKey(row.at)
    if (key < first || key > lastDay) continue
    if (!presentDays.has(row.guardId)) presentDays.set(row.guardId, new Set())
    presentDays.get(row.guardId)!.add(key)
  }
  const byGuard = new Map(existing.map((row) => [row.guardId, row]))
  const output = []
  for (const guard of guardRows.filter((item) => item.status !== 'suspended' || byGuard.has(item.id))) {
    const stored = byGuard.get(guard.id)
    const extra = { guardName: guard.name, photoUrl: guard.photoUrl, site: guard.site }
    if (stored?.status === 'paid') { output.push({ ...stored, ...extra }); continue }
    const created = dayKey(guard.createdAt)
    const start = created > first ? created : first
    if (start > upTo) continue
    const daysCounted = Number(upTo.slice(8)) - Number(start.slice(8)) + 1
    const daysPresent = [...(presentDays.get(guard.id) ?? [])].filter((key) => key >= start && key <= upTo).length
    const values = { baseSalary: guard.monthlySalary, daysInPeriod: daysInMonth, pension: 0, ...computePayroll({ baseSalary: guard.monthlySalary, daysInMonth, daysCounted, daysPresent }) }
    const [row] = await db.insert(payrollRecords).values({ ...current, guardId: guard.id, period: period.data, status: 'pending', createdAt: new Date(), ...values })
      .onConflictDoUpdate({ target: [payrollRecords.guardId, payrollRecords.period], set: values, setWhere: eq(payrollRecords.status, 'pending') }).returning()
    output.push({ ...(row ?? stored), ...extra })
  }
  return NextResponse.json({ period: period.data, rows: output.sort((a, b) => a.guardName.localeCompare(b.guardName)), isModerator: await isModerator(current) })
}

const markInput = z.object({ id: z.string().uuid(), status: z.enum(['paid', 'pending']) })

/** Moderators tick a row to mark it paid (or untick to return it to pending). */
export async function PATCH(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization.', 401)
  if (!(await isModerator(current))) return fail('Only a moderator or administrator can change payment status.', 403)
  const parsed = markInput.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail('Invalid request')
  const paid = parsed.data.status === 'paid'
  const [row] = await db.update(payrollRecords).set({ status: parsed.data.status, paidAt: paid ? new Date() : null, paidBy: paid ? current.userId : null })
    .where(and(eq(payrollRecords.id, parsed.data.id), eq(payrollRecords.organizationId, current.organizationId))).returning()
  if (!row) return fail('Payroll record not found', 404)
  await db.insert(activityEvents).values({ ...current, type: 'payroll.status', title: `Payroll marked ${parsed.data.status}`, body: `${row.period} · ₦${row.netPay.toLocaleString('en-NG')}`, tone: 'neutral', createdAt: new Date() })
  return NextResponse.json(row)
}
