import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alerts, attendance, finances, guards, incidents, patrols, sites } from '@/lib/db/schema'

async function owner() { const session = await auth.api.getSession({ headers: await headers() }); return session?.user?.id ?? null }
const tables = { guards, sites, attendance, patrols, incidents, alerts, finances } as const

export async function GET(request: Request) {
  const userId = await owner(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const section = new URL(request.url).searchParams.get('section')
  const table = section === 'live-map' ? patrols : section && section in tables ? tables[section as keyof typeof tables] : undefined
  if (!table) return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  const rows = await db.select().from(table).where(eq(table.userId, userId)).orderBy(desc(table.createdAt)).limit(250)
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const userId = await owner(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json(); const now = new Date(); const section = String(body.section)
  if (section === 'guards') { const name = String(body.name ?? '').trim(), nin = String(body.nin ?? '').trim(), phone = String(body.phone ?? '').trim(); if (!name || !nin || !phone) return NextResponse.json({ error: 'Name, NIN and phone are required' }, { status: 400 }); const [row] = await db.insert(guards).values({ userId, name, nin, phone, initials: name.split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(), status: 'active', nfcToken: `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: now }).returning(); return NextResponse.json(row) }
  if (section === 'sites') { const [row] = await db.insert(sites).values({ userId, name: String(body.name), address: String(body.address), latitude: Number(body.latitude), longitude: Number(body.longitude), geofenceRadius: Number(body.geofenceRadius || 100), status: 'active', createdAt: now }).returning(); return NextResponse.json(row) }
  if (section === 'incidents') { const [row] = await db.insert(incidents).values({ userId, title: String(body.title), description: String(body.description), severity: String(body.severity || 'medium'), status: 'open', site: String(body.site), reportedAt: now, createdAt: now }).returning(); return NextResponse.json(row) }
  if (section === 'finances') { const [row] = await db.insert(finances).values({ userId, kind: String(body.kind || 'revenue'), label: String(body.label), amount: Number(body.amount || 0), status: String(body.status || 'pending'), dueDate: body.dueDate ? new Date(body.dueDate) : null, notes: body.notes ? String(body.notes) : null, createdAt: now }).returning(); return NextResponse.json(row) }
  if (section === 'patrols') { const [row] = await db.insert(patrols).values({ userId, guardId: String(body.guardId), siteId: body.siteId ? String(body.siteId) : null, loggedAt: body.loggedAt ? new Date(body.loggedAt) : now, latitude: Number(body.latitude), longitude: Number(body.longitude), method: String(body.method || 'nfc'), withinBounds: Boolean(body.withinBounds), createdAt: now }).returning(); return NextResponse.json(row) }
  return NextResponse.json({ error: 'This module is read-only here' }, { status: 400 })
}

export async function PATCH(request: Request) { const userId = await owner(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const { section, id, ...changes } = await request.json(); const table = tables[section as keyof typeof tables]; if (!table) return NextResponse.json({ error: 'Unknown section' }, { status: 400 }); const [row] = await db.update(table).set(changes).where(and(eq(table.id, id), eq(table.userId, userId))).returning(); return NextResponse.json(row) }
export async function DELETE(request: Request) { const userId = await owner(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const { section, id } = await request.json(); const table = tables[section as keyof typeof tables]; if (!table) return NextResponse.json({ error: 'Unknown section' }, { status: 400 }); await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId))); return NextResponse.json({ ok: true }) }
