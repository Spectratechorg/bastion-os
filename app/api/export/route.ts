import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { actor, can, denyGuard } from '@/lib/server'
import { db } from '@/lib/db'
import { attendance, clients, finances, guards, incidents, patrols, payrollRecords, sites } from '@/lib/db/schema'

const tables = { guards, sites, attendance, patrols, incidents, finances, clients, payroll: payrollRecords } as const

function csvValue(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
  const currentUser = await actor()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyGuard(currentUser)
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const section = params.get('section')
  if (!section || !(section in tables)) return NextResponse.json({ error: 'Unknown export section' }, { status: 400 })
  if (['finances', 'payroll', 'clients'].includes(section) && !(await can(currentUser, 'viewFinance'))) return NextResponse.json({ error: 'Your role cannot export finance records.' }, { status: 403 })
  const table = tables[section as keyof typeof tables]
  // Optional date range (Lagos days, UTC+1) from the Reports page.
  const from = params.get('from'); const to = params.get('to')
  const okDate = (value: string | null) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!okDate(from) || !okDate(to)) return NextResponse.json({ error: 'Dates must look like 2026-10-31' }, { status: 400 })
  const dateColumn = { guards: guards.createdAt, sites: sites.createdAt, attendance: attendance.checkedInAt, patrols: patrols.loggedAt, incidents: incidents.reportedAt, finances: finances.createdAt, clients: clients.createdAt, payroll: payrollRecords.createdAt }[section as keyof typeof tables]
  const start = from ? new Date(`${from}T00:00:00+01:00`) : null
  const end = to ? new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86400000) : null
  const range = [start && gte(dateColumn, start), end && lt(dateColumn, end)].filter(Boolean) as ReturnType<typeof gte>[]
  const rows = await db.select().from(table).where(and(eq(table.organizationId, currentUser.organizationId), ...range)).orderBy(desc(dateColumn)).limit(20000)
  const keys = (rows.length ? Object.keys(rows[0]) : []).filter((key) => key !== 'photoUrl' && key !== 'receiptUrl')
  const content = [keys.join(','), ...rows.map((row) => keys.map((key) => csvValue(row[key as keyof typeof row])).join(','))].join('\n')
  return new NextResponse(content, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bastion-${section}.csv"` } })
}
