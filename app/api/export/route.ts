import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alerts, attendance, guards, incidents, patrols, payrollRecords, sites } from '@/lib/db/schema'

const tables = { guards, sites, attendance, patrols, incidents, alerts, payroll: payrollRecords } as const

function csvValue(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  const organizationId = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  if (!session?.user || !organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const section = new URL(request.url).searchParams.get('section')
  if (!section || !(section in tables)) return NextResponse.json({ error: 'Unknown export section' }, { status: 400 })
  const table = tables[section as keyof typeof tables]
  const rows = await db.select().from(table).where(eq(table.organizationId, organizationId)).orderBy(desc(table.createdAt)).limit(5000)
  const keys = (rows.length ? Object.keys(rows[0]) : []).filter((key) => key !== 'photoUrl')
  const content = [keys.join(','), ...rows.map((row) => keys.map((key) => csvValue(row[key as keyof typeof row])).join(','))].join('\n')
  return new NextResponse(content, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bastion-${section}.csv"` } })
}
