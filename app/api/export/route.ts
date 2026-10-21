import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, clients, finances, guards, incidents, patrols, sites } from '@/lib/db/schema'

const tables = { guards, sites, attendance, patrols, incidents, finances, clients } as const

function csvValue(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
  const currentUser = await getActiveOrganization()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!currentUser.organizationId) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })
  const section = new URL(request.url).searchParams.get('section')
  if (!section || !(section in tables)) return NextResponse.json({ error: 'Unknown export section' }, { status: 400 })
  const table = tables[section as keyof typeof tables]
  const rows = await db.select().from(table).where(eq(table.organizationId, currentUser.organizationId)).orderBy(desc(table.createdAt)).limit(5000)
  const keys = rows.length ? Object.keys(rows[0]) : []
  const content = [keys.join(','), ...rows.map((row) => keys.map((key) => csvValue(row[key as keyof typeof row])).join(','))].join('\n')
  return new NextResponse(content, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bastion-${section}.csv"` } })
}
