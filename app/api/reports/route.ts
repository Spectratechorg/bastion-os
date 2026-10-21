import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { clients, finances, guards, incidents, sites } from '@/lib/db/schema'

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const current = await getActiveOrganization()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.organizationId) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })

  const organizationId = current.organizationId
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const [guardCounts, siteCounts, incidentCounts, financeRows, clientRows] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${guards.status} = 'active')`,
    }).from(guards).where(eq(guards.organizationId, organizationId)),
    db.select({ total: sql<number>`count(*)` }).from(sites).where(eq(sites.organizationId, organizationId)),
    db.select({
      total: sql<number>`count(*)`,
      open: sql<number>`count(*) filter (where ${incidents.status} != 'resolved')`,
    }).from(incidents).where(eq(incidents.organizationId, organizationId)),
    db.select().from(finances).where(and(
      eq(finances.organizationId, organizationId),
      gte(finances.createdAt, yearStart),
    )).limit(5000),
    db.select({ total: sql<number>`count(*)` }).from(clients).where(eq(clients.organizationId, organizationId)),
  ])

  const revenue = financeRows.filter((row) => ['revenue', 'invoice'].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const costs = financeRows.filter((row) => !['revenue', 'invoice'].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const pending = financeRows.filter((row) => !['paid', 'settled', 'received'].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0)
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    periodStart: yearStart.toISOString(),
    summary: {
      guards: { total: Number(guardCounts[0]?.total ?? 0), active: Number(guardCounts[0]?.active ?? 0) },
      sites: Number(siteCounts[0]?.total ?? 0),
      incidents: { total: Number(incidentCounts[0]?.total ?? 0), open: Number(incidentCounts[0]?.open ?? 0) },
      clients: Number(clientRows[0]?.total ?? 0),
      finance: { revenue, costs, pending },
    },
  })
}
