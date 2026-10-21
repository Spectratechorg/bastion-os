import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { activityEvents, alerts, attendance, clients, finances, guards, incidents, patrols, sites } from '@/lib/db/schema'
import { isModerator } from '@/lib/server'

const sectionSchema = z.enum(['guards', 'sites', 'attendance', 'patrols', 'incidents', 'alerts', 'finances', 'live-map'])
const databaseUnavailable = () => NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

type CurrentUser = { userId: string; organizationId: string }

async function getCurrentUser() {
  const user = await getActiveOrganization()
  if (!user) return { response: fail('Unauthorized', 401) }
  if (!user.organizationId) return { response: fail('No active organization membership. Select an organization before accessing records.', 403) }
  return { current: { userId: user.userId, organizationId: user.organizationId } satisfies CurrentUser }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (cause) {
    if (cause instanceof SyntaxError) return null
    throw cause
  }
}

async function log(current: CurrentUser, type: string, title: string, body: string) {
  await db.insert(activityEvents).values({ ...current, type, title, body, tone: 'neutral', createdAt: new Date() })
}

const guardCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nin: z.string().trim().min(4).max(100),
  phone: z.string().trim().min(7).max(50),
  site: z.string().trim().max(200).nullable().optional(),
  monthlySalary: z.coerce.number().int().nonnegative().max(100_000_000).default(0),
  photoUrl: z.string().max(1_500_000).nullable().optional(),
})
const siteCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  address: z.string().trim().min(4).max(500),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  geofenceRadius: z.coerce.number().int().positive().max(100_000).default(100),
  dangerLevel: z.enum(['low', 'medium', 'high']).default('low'),
})
const incidentCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(5000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  site: z.string().trim().min(2).max(200),
})
const financeCreateSchema = z.object({
  kind: z.string().trim().min(1).max(64).default('revenue'),
  label: z.string().trim().min(1).max(200),
  amount: z.coerce.number().finite().nonnegative(),
  status: z.string().trim().min(1).max(32).default('pending'),
  dueDate: z.union([z.string().datetime(), z.literal('')]).optional(),
  notes: z.string().trim().max(5000).optional(),
  clientId: z.union([z.string().uuid(), z.literal('')]).optional(),
  siteId: z.union([z.string().uuid(), z.literal('')]).optional(),
  category: z.string().trim().max(64).optional(),
  receiptUrl: z.string().max(1_500_000).nullable().optional(),
})

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return databaseUnavailable()
  const { current, response } = await getCurrentUser()
  if (response) return response

  const parsedSection = sectionSchema.safeParse(new URL(request.url).searchParams.get('section'))
  if (!parsedSection.success) return fail('Unknown section')
  const section = parsedSection.data === 'live-map' ? 'patrols' : parsedSection.data

  switch (section) {
    case 'guards':
      return NextResponse.json(await db.select().from(guards).where(eq(guards.organizationId, current.organizationId)).orderBy(desc(guards.createdAt)).limit(250))
    case 'sites':
      return NextResponse.json(await db.select().from(sites).where(eq(sites.organizationId, current.organizationId)).orderBy(desc(sites.createdAt)).limit(250))
    case 'attendance':
      return NextResponse.json(await db.select().from(attendance).where(eq(attendance.organizationId, current.organizationId)).orderBy(desc(attendance.createdAt)).limit(250))
    case 'patrols':
      return NextResponse.json(await db.select().from(patrols).where(eq(patrols.organizationId, current.organizationId)).orderBy(desc(patrols.createdAt)).limit(250))
    case 'incidents':
      return NextResponse.json(await db.select().from(incidents).where(eq(incidents.organizationId, current.organizationId)).orderBy(desc(incidents.createdAt)).limit(250))
    case 'alerts':
      return NextResponse.json(await db.select().from(alerts).where(eq(alerts.organizationId, current.organizationId)).orderBy(desc(alerts.createdAt)).limit(250))
    case 'finances':
      return NextResponse.json(await db.select().from(finances).where(eq(finances.organizationId, current.organizationId)).orderBy(desc(finances.createdAt)).limit(250))
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return databaseUnavailable()
  const { current, response } = await getCurrentUser()
  if (response) return response

  const body = await readJson(request)
  if (!body || typeof body !== 'object' || !('section' in body)) return fail('Provide a valid request body and section.')
  const section = sectionSchema.safeParse(body.section)
  if (!section.success) return fail('Unknown section')
  const now = new Date()

  if (section.data === 'guards') {
    const parsed = guardCreateSchema.safeParse(body)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid guard.')
    if (parsed.data.monthlySalary > 0 && !(await isModerator(current))) return fail('Only an owner, administrator, or moderator can set guard salary.', 403)
    const siteName = parsed.data.site || null
    if (siteName) {
      const [site] = await db.select({ id: sites.id }).from(sites).where(and(
        eq(sites.organizationId, current.organizationId),
        eq(sites.name, siteName),
        eq(sites.status, 'active'),
      )).limit(1)
      if (!site) return fail('Select an active site in this organization.', 400)
    }
    const [row] = await db.insert(guards).values({
      ...current,
      ...parsed.data,
      site: siteName,
      initials: parsed.data.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      status: 'active',
      nfcToken: `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      monthlySalary: parsed.data.monthlySalary,
      photoUrl: parsed.data.photoUrl ?? null,
      createdAt: now,
    }).returning()
    await log(current, 'guard.created', `Guard added: ${row.name}`, 'A new guard was added to the roster.')
    return NextResponse.json(row, { status: 201 })
  }

  if (section.data === 'sites') {
    const parsed = siteCreateSchema.safeParse(body)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid site.')
    const [row] = await db.insert(sites).values({ ...current, ...parsed.data, status: 'active', createdAt: now }).returning()
    await log(current, 'site.created', `Site added: ${row.name}`, row.address)
    return NextResponse.json(row, { status: 201 })
  }

  if (section.data === 'incidents') {
    const parsed = incidentCreateSchema.safeParse(body)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid incident.')
    const [row] = await db.insert(incidents).values({
      ...current,
      ...parsed.data,
      status: 'open',
      comments: [],
      timeline: [`${now.toISOString()} Incident reported`],
      reportedAt: now,
      createdAt: now,
    }).returning()
    await log(current, 'incident.created', `Incident reported: ${row.title}`, row.site)
    return NextResponse.json(row, { status: 201 })
  }

  if (section.data === 'finances') {
    const parsed = financeCreateSchema.safeParse(body)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid finance record.')
    const clientId = parsed.data.clientId || null
    const siteId = parsed.data.siteId || null
    if (clientId) {
      const [client] = await db.select({ id: clients.id }).from(clients).where(and(
        eq(clients.organizationId, current.organizationId),
        eq(clients.id, clientId),
      )).limit(1)
      if (!client) return fail('Select a client in this organization.')
    }
    if (siteId) {
      const [site] = await db.select({ id: sites.id }).from(sites).where(and(
        eq(sites.organizationId, current.organizationId),
        eq(sites.id, siteId),
      )).limit(1)
      if (!site) return fail('Select a site in this organization.')
    }
    const [row] = await db.insert(finances).values({
      ...current,
      ...parsed.data,
      clientId,
      siteId,
      category: parsed.data.category || null,
      receiptUrl: parsed.data.receiptUrl ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      notes: parsed.data.notes || null,
      createdAt: now,
    }).returning()
    await log(current, 'finance.created', `Finance record added: ${row.label}`, row.kind)
    return NextResponse.json(row, { status: 201 })
  }

  return fail('This record type is created by the guard check-in workflow.', 405)
}

const updateSchema = z.object({
  section: sectionSchema,
  id: z.string().uuid(),
  action: z.enum(['update', 'suspend', 'reactivate', 'reissue-nfc', 'deactivate', 'approve', 'flag', 'assign', 'comment', 'escalate', 'resolve', 'acknowledge', 'complete', 'settle', 'reopen', 'delete']).default('update'),
  name: z.string().trim().min(2).max(200).optional(),
  nin: z.string().trim().min(4).max(100).optional(),
  phone: z.string().trim().min(7).max(50).optional(),
  site: z.string().trim().max(200).nullable().optional(),
  monthlySalary: z.coerce.number().int().nonnegative().max(100_000_000).optional(),
  photoUrl: z.string().max(1_500_000).nullable().optional(),
  address: z.string().trim().min(4).max(500).optional(),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  geofenceRadius: z.coerce.number().int().positive().max(100_000).optional(),
  dangerLevel: z.enum(['low', 'medium', 'high']).optional(),
  status: z.string().trim().min(1).max(32).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  acknowledged: z.boolean().optional(),
  comment: z.string().trim().min(1).max(1000).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  amount: z.coerce.number().finite().nonnegative().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  dueDate: z.union([z.string().datetime(), z.literal('')]).nullable().optional(),
  clientId: z.union([z.string().uuid(), z.literal('')]).nullable().optional(),
  siteId: z.union([z.string().uuid(), z.literal('')]).nullable().optional(),
  category: z.string().trim().max(64).nullable().optional(),
  receiptUrl: z.string().max(1_500_000).nullable().optional(),
})

export async function PATCH(request: Request) {
  if (!process.env.DATABASE_URL) return databaseUnavailable()
  const { current, response } = await getCurrentUser()
  if (response) return response

  const parsed = updateSchema.safeParse(await readJson(request))
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid update.')
  const { section, id, action } = parsed.data
  const now = new Date()
  let row: object | undefined
  let eventTitle = 'Record updated'
  let eventBody: string = action

  if (section === 'guards') {
    let changes: Partial<typeof guards.$inferInsert>
    if (action === 'suspend') changes = { status: 'suspended', suspendedAt: now }
    else if (action === 'reactivate') changes = { status: 'active', suspendedAt: null }
    else if (action === 'reissue-nfc') changes = { nfcToken: `BOS-${crypto.randomUUID().slice(0, 8).toUpperCase()}` }
    else if (action === 'update') changes = {
      name: parsed.data.name,
      nin: parsed.data.nin,
      phone: parsed.data.phone,
      site: parsed.data.site,
      monthlySalary: parsed.data.monthlySalary,
      photoUrl: parsed.data.photoUrl,
    }
    else return fail('Unsupported guard action.')
    if (parsed.data.monthlySalary !== undefined && !(await isModerator(current))) {
      return fail('Only an owner, administrator, or moderator can change guard salary.', 403)
    }

    if (changes.site) {
      const [site] = await db.select({ id: sites.id }).from(sites).where(and(
        eq(sites.organizationId, current.organizationId),
        eq(sites.name, changes.site),
        eq(sites.status, 'active'),
      )).limit(1)
      if (!site) return fail('Select an active site in this organization.')
    }
    const values = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    if (Object.keys(values).length === 0) return fail('Provide at least one guard field to update.')
    const [updated] = await db.update(guards).set(values).where(and(eq(guards.id, id), eq(guards.organizationId, current.organizationId))).returning()
    if (!updated) return fail('Guard not found in this organization.', 404)
    row = updated
    eventTitle = `Guard updated: ${updated.name}`
  } else if (section === 'sites') {
    let changes: Partial<typeof sites.$inferInsert>
    if (action === 'deactivate') changes = { status: 'inactive' }
    else if (action === 'update') changes = {
      name: parsed.data.name,
      address: parsed.data.address,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      geofenceRadius: parsed.data.geofenceRadius,
      dangerLevel: parsed.data.dangerLevel,
    }
    else return fail('Unsupported site action.')
    const values = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    if (Object.keys(values).length === 0) return fail('Provide at least one site field to update.')
    const [updated] = await db.update(sites).set(values).where(and(eq(sites.id, id), eq(sites.organizationId, current.organizationId))).returning()
    if (!updated) return fail('Site not found in this organization.', 404)
    row = updated
    eventTitle = `Site updated: ${updated.name}`
  } else if (section === 'attendance') {
    if (!['approve', 'flag'].includes(action)) return fail('Unsupported attendance action.')
    const [updated] = await db.update(attendance).set({ reviewStatus: action === 'approve' ? 'approved' : 'flagged' })
      .where(and(eq(attendance.id, id), eq(attendance.organizationId, current.organizationId))).returning()
    if (!updated) return fail('Attendance record not found in this organization.', 404)
    row = updated
    eventTitle = 'Attendance reviewed'
  } else if (section === 'patrols' || section === 'live-map') {
    if (action !== 'complete') return fail('Patrol records are read-only except for marking a patrol complete.', 405)
    const [updated] = await db.update(patrols).set({ status: 'completed', progress: 100 })
      .where(and(eq(patrols.id, id), eq(patrols.organizationId, current.organizationId))).returning()
    if (!updated) return fail('Patrol not found in this organization.', 404)
    row = updated
    eventTitle = `Patrol updated: ${updated.routeName ?? updated.id}`
  } else if (section === 'incidents') {
    const where = and(eq(incidents.id, id), eq(incidents.organizationId, current.organizationId))
    const [record] = await db.select().from(incidents).where(where).limit(1)
    if (!record) return fail('Incident not found in this organization.', 404)
    if (action === 'comment') {
      if (!parsed.data.comment) return fail('Enter a comment before submitting.')
      const [updated] = await db.update(incidents).set({
        comments: [...record.comments, parsed.data.comment],
        timeline: [...record.timeline, `${now.toISOString()} Comment added`],
      }).where(where).returning()
      row = updated
      eventBody = 'Comment added'
    } else if (action === 'escalate' || action === 'resolve' || (action === 'update' && parsed.data.status)) {
      const status = action === 'escalate' ? 'escalated' : action === 'resolve' ? 'resolved' : parsed.data.status!
      const [updated] = await db.update(incidents).set({
        status,
        timeline: [...record.timeline, `${now.toISOString()} ${status}`],
      }).where(where).returning()
      row = updated
      eventBody = status
    } else {
      return fail('Unsupported incident action.')
    }
    eventTitle = `Incident updated: ${record.title}`
  } else if (section === 'alerts') {
    if (action !== 'acknowledge' && action !== 'update') return fail('Unsupported alert action.')
    const acknowledged = action === 'acknowledge' ? true : parsed.data.acknowledged
    if (acknowledged === undefined) return fail('Provide an acknowledgement update.')
    const [updated] = await db.update(alerts).set({ acknowledged })
      .where(and(eq(alerts.id, id), eq(alerts.organizationId, current.organizationId))).returning()
    if (!updated) return fail('Alert not found in this organization.', 404)
    row = updated
    eventTitle = `Alert updated: ${updated.title}`
  } else if (section === 'finances') {
    const where = and(eq(finances.id, id), eq(finances.organizationId, current.organizationId))
    const [record] = await db.select().from(finances).where(where).limit(1)
    if (!record) return fail('Finance record not found in this organization.', 404)

    if (action === 'delete') {
      if (!(await isModerator(current))) return fail('Only an owner, administrator or moderator can delete a finance record.', 403)
      await db.delete(finances).where(where)
      await log(current, 'finance.deleted', `Finance record deleted: ${record.label}`, `${record.kind} · ${record.status}`)
      return NextResponse.json({ id, deleted: true })
    }

    let changes: Partial<typeof finances.$inferInsert>
    if (action === 'settle') changes = { status: 'paid' }
    else if (action === 'reopen') changes = { status: 'pending' }
    else if (action === 'update') changes = {
      kind: parsed.data.kind,
      label: parsed.data.label,
      amount: parsed.data.amount,
      status: parsed.data.status,
      notes: parsed.data.notes,
      clientId: parsed.data.clientId === undefined ? undefined : parsed.data.clientId || null,
      siteId: parsed.data.siteId === undefined ? undefined : parsed.data.siteId || null,
      category: parsed.data.category === undefined ? undefined : parsed.data.category || null,
      receiptUrl: parsed.data.receiptUrl,
      dueDate: parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    }
    else return fail('Unsupported finance action.')

    const values = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    if (Object.keys(values).length === 0) return fail('Provide at least one finance field to update.')
    const [updated] = await db.update(finances).set(values).where(where).returning()
    if (!updated) return fail('Finance record not found in this organization.', 404)
    row = updated
    eventTitle = `Finance record ${action === 'settle' ? 'marked paid' : action === 'reopen' ? 'reopened' : 'updated'}: ${updated.label}`
    eventBody = `${updated.kind} · ${updated.status}`
  } else {
    return fail('Unsupported record type.')
  }

  await log(current, `${section}.${action}`, eventTitle, eventBody)
  return NextResponse.json(row)
}

export async function DELETE() {
  return fail('Destructive deletion is disabled. Deactivate a site or suspend a guard instead.', 405)
}
