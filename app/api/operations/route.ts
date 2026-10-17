import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { activityEvents, alerts, attendance, finances, guards, incidents, patrols, sites } from '@/lib/db/schema'

const sectionSchema = z.enum(['guards', 'sites', 'attendance', 'patrols', 'incidents', 'alerts', 'finances'])
const tables = { guards, sites, attendance, patrols, incidents, alerts, finances } as const

async function actor() {
  const session = await auth.api.getSession({ headers: await headers() })
  const organizationId = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  return session?.user && organizationId ? { userId: session.user.id, organizationId } : null
}

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })
const defined = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
async function log(current: { userId: string; organizationId: string }, type: string, title: string, body: string) {
  await db.insert(activityEvents).values({ ...current, type, title, body, tone: 'neutral', createdAt: new Date() })
}

export async function GET(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization to load records.', 401)
  const section = sectionSchema.safeParse(new URL(request.url).searchParams.get('section')); if (!section.success) return fail('Unknown section')
  const table = tables[section.data]
  const rows = await db.select().from(table).where(eq(table.organizationId, current.organizationId)).orderBy(desc(table.createdAt)).limit(250)
  return NextResponse.json(rows)
}

const guardCreate = z.object({ name: z.string().trim().min(2), nin: z.string().trim().min(4), phone: z.string().trim().min(7), site: z.string().trim().optional().nullable() })
const siteCreate = z.object({ name: z.string().trim().min(2), address: z.string().trim().min(4), latitude: z.coerce.number(), longitude: z.coerce.number(), geofenceRadius: z.coerce.number().int().positive().default(100), dangerLevel: z.enum(['low', 'medium', 'high']).default('low') })
const incidentCreate = z.object({ title: z.string().trim().min(2), description: z.string().trim().min(2), severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'), site: z.string().trim().min(2) })

export async function POST(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization before creating records.', 401)
  const payload: unknown = await request.json().catch(() => null)
  const section = sectionSchema.safeParse((payload as { section?: unknown } | null)?.section); if (!section.success) return fail('Unknown section')
  const now = new Date()
  if (section.data === 'guards') {
    const data = guardCreate.safeParse(payload); if (!data.success) return fail(data.error.issues[0]?.message ?? 'Invalid guard')
    const [row] = await db.insert(guards).values({ ...current, ...data.data, initials: data.data.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), status: 'active', nfcToken: `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: now }).returning()
    await log(current, 'guard.created', `Guard added: ${row.name}`, 'A new guard was added to the roster.'); return NextResponse.json(row, { status: 201 })
  }
  if (section.data === 'sites') {
    const data = siteCreate.safeParse(payload); if (!data.success) return fail(data.error.issues[0]?.message ?? 'Invalid site')
    const [row] = await db.insert(sites).values({ ...current, ...data.data, status: 'active', createdAt: now }).returning()
    await log(current, 'site.created', `Site added: ${row.name}`, row.address); return NextResponse.json(row, { status: 201 })
  }
  if (section.data === 'incidents') {
    const data = incidentCreate.safeParse(payload); if (!data.success) return fail(data.error.issues[0]?.message ?? 'Invalid incident')
    const [row] = await db.insert(incidents).values({ ...current, ...data.data, status: 'open', comments: [], timeline: [`${now.toISOString()} Incident reported`], reportedAt: now, createdAt: now }).returning()
    await log(current, 'incident.created', `Incident reported: ${row.title}`, row.site); return NextResponse.json(row, { status: 201 })
  }
  return fail('This record type is created by the guard check-in workflow.', 405)
}

const updateInput = z.object({ section: sectionSchema, id: z.string().uuid(), action: z.enum(['update', 'suspend', 'reactivate', 'reissue-nfc', 'deactivate', 'approve', 'flag', 'assign', 'comment', 'status', 'escalate', 'resolve', 'acknowledge']).optional(), status: z.string().max(32).optional(), site: z.string().max(150).nullable().optional(), assigneeId: z.string().uuid().nullable().optional(), comment: z.string().trim().min(1).max(1000).optional(), acknowledged: z.boolean().optional(), name: z.string().trim().min(2).optional(), phone: z.string().trim().min(7).optional(), address: z.string().trim().min(4).optional(), latitude: z.coerce.number().optional(), longitude: z.coerce.number().optional(), geofenceRadius: z.coerce.number().int().positive().optional(), dangerLevel: z.enum(['low', 'medium', 'high']).optional() })

export async function PATCH(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization before editing records.', 401)
  const parsed = updateInput.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid update')
  const { section, id, action = 'update', comment, ...changes } = parsed.data
  const where = and(eq(tables[section].id, id), eq(tables[section].organizationId, current.organizationId))
  if (section === 'guards') {
    const values = action === 'suspend' ? { status: 'suspended', suspendedAt: new Date() } : action === 'reactivate' ? { status: 'active', suspendedAt: null } : action === 'reissue-nfc' ? { nfcToken: `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}` } : defined({ name: changes.name, phone: changes.phone, site: changes.site })
    const [row] = await db.update(guards).set(values).where(where).returning(); if (!row) return fail('Guard not found', 404)
    await log(current, `guard.${action}`, `Guard updated: ${row.name}`, action); return NextResponse.json(row)
  }
  if (section === 'sites') {
    const values = action === 'deactivate' ? { status: 'inactive' } : defined({ address: changes.address, latitude: changes.latitude, longitude: changes.longitude, geofenceRadius: changes.geofenceRadius, dangerLevel: changes.dangerLevel })
    const [row] = await db.update(sites).set(values).where(where).returning(); if (!row) return fail('Site not found', 404)
    await log(current, `site.${action}`, `Site updated: ${row.name}`, action); return NextResponse.json(row)
  }
  if (section === 'attendance') {
    const [row] = await db.update(attendance).set({ reviewStatus: action === 'approve' ? 'approved' : action === 'flag' ? 'flagged' : changes.status }).where(where).returning(); if (!row) return fail('Attendance record not found', 404)
    await log(current, `attendance.${action}`, 'Attendance reviewed', action); return NextResponse.json(row)
  }
  if (section === 'incidents') {
    const record = (await db.select().from(incidents).where(where).limit(1))[0]; if (!record) return fail('Incident not found', 404)
    const timeline = [...(record.timeline ?? []), `${new Date().toISOString()} ${action === 'comment' ? `Comment: ${comment}` : action}`]
    const values = action === 'assign' ? { assigneeId: changes.assigneeId, timeline } : action === 'comment' ? { comments: [...(record.comments ?? []), comment!], timeline } : { status: action === 'escalate' ? 'escalated' : action === 'resolve' ? 'resolved' : changes.status ?? record.status, timeline }
    const [row] = await db.update(incidents).set(values).where(where).returning(); await log(current, `incident.${action}`, `Incident updated: ${row.title}`, action); return NextResponse.json(row)
  }
  if (section === 'alerts') {
    const [row] = await db.update(alerts).set({ acknowledged: action === 'acknowledge' ? true : changes.acknowledged ?? false }).where(where).returning(); if (!row) return fail('Alert not found', 404)
    await log(current, 'alert.acknowledged', `Alert acknowledged: ${row.title}`, 'Alert acknowledged'); return NextResponse.json(row)
  }
  return fail('This record is read-only here', 405)
}

export async function DELETE() { return fail('Destructive deletion is disabled. Deactivate a site or suspend a guard instead.', 405) }
