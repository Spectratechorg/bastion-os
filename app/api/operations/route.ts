import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { db, pool } from '@/lib/db'
import { raiseAlert } from '@/lib/alerts'
import { activityEvents, alerts, attendance, clients, finances, guards, incidents, patrolCheckpoints, patrols, payrollRecords, sites } from '@/lib/db/schema'
import { actor, can, denyGuard, isModerator } from '@/lib/server'
import type { PermissionKey } from '@/lib/permissions'

const sectionSchema = z.enum(['guards', 'sites', 'attendance', 'patrols', 'incidents', 'alerts', 'finances', 'live-map', 'activity'])
const databaseUnavailable = () => NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

type CurrentUser = { userId: string; organizationId: string; role: string }

async function getCurrentUser() {
  const user = await actor()
  if (!user) return { response: fail('Sign in and select an organization to continue.', 401) }
  const denied = denyGuard(user)
  if (denied) return { response: denied }
  return { current: user satisfies CurrentUser }
}

/** Section-level permission switches (editable in Settings). */
const needFor = (section: string): PermissionKey | null => section === 'guards' || section === 'sites' ? 'manageGuards' : section === 'incidents' || section === 'alerts' ? 'manageIncidents' : null

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (cause) {
    if (cause instanceof SyntaxError) return null
    throw cause
  }
}

async function log(current: { userId: string; organizationId: string }, type: string, title: string, body: string) {
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
  clientId: z.union([z.string().uuid(), z.literal('')]).nullable().optional(),
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

const SEVERITY_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 5 }

/**
 * Site risk is calculated, not typed in. Over the last 30 days every incident at the site adds points by severity
 * (low 1, medium 2, high 3, critical 5) and every check-in outside the geofence adds 1.
 * 0-2 points = low, 3-7 = medium, 8 or more = high. `dangerLevel` in the response is this calculated value.
 */
async function withRisk(organizationId: string, rows: (typeof sites.$inferSelect)[]) {
  const since = new Date(Date.now() - 30 * 86400000)
  const [inc, outside, assigned, clientRows] = await Promise.all([
    pool.query('select site, severity, count(*)::int as n from incidents where organization_id = $1 and reported_at >= $2 group by site, severity', [organizationId, since]),
    pool.query('select site_id, count(*)::int as n from attendance where organization_id = $1 and checked_in_at >= $2 and within_geofence = false group by site_id', [organizationId, since]),
    pool.query("select site, count(*)::int as n from guards where organization_id = $1 and status = 'active' and site is not null group by site", [organizationId]),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, organizationId)),
  ])
  return rows.map((site) => {
    const incidentRows = inc.rows.filter((r) => r.site === site.name)
    const incidentPoints = incidentRows.reduce((t, r) => t + (SEVERITY_WEIGHT[r.severity] ?? 1) * r.n, 0)
    const incidentCount = incidentRows.reduce((t, r) => t + r.n, 0)
    const outsideCount = outside.rows.find((r) => r.site_id === site.id)?.n ?? 0
    const score = incidentPoints + outsideCount
    const level = score >= 8 ? 'high' : score >= 3 ? 'medium' : 'low'
    return {
      ...site, dangerLevel: level, riskScore: score,
      riskReason: score === 0 ? 'No incidents or geofence breaches in 30 days' : `${incidentCount} incident${incidentCount === 1 ? '' : 's'} and ${outsideCount} outside-geofence check-in${outsideCount === 1 ? '' : 's'} in 30 days`,
      guardCount: assigned.rows.find((r) => r.site === site.name)?.n ?? 0,
      clientName: clientRows.find((c) => c.id === site.clientId)?.name ?? null,
    }
  })
}

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
      return NextResponse.json(await withRisk(current.organizationId, await db.select().from(sites).where(eq(sites.organizationId, current.organizationId)).orderBy(desc(sites.createdAt)).limit(250)))
    case 'attendance':
      return NextResponse.json(await db.select().from(attendance).where(eq(attendance.organizationId, current.organizationId)).orderBy(desc(attendance.createdAt)).limit(250))
    case 'patrols':
      return NextResponse.json(await db.select().from(patrols).where(eq(patrols.organizationId, current.organizationId)).orderBy(desc(patrols.createdAt)).limit(250))
    case 'incidents':
      return NextResponse.json(await db.select().from(incidents).where(eq(incidents.organizationId, current.organizationId)).orderBy(desc(incidents.createdAt)).limit(250))
    case 'alerts':
      return NextResponse.json(await db.select().from(alerts).where(eq(alerts.organizationId, current.organizationId)).orderBy(desc(alerts.createdAt)).limit(250))
    case 'activity':
      return NextResponse.json(await db.select().from(activityEvents).where(eq(activityEvents.organizationId, current.organizationId)).orderBy(desc(activityEvents.createdAt)).limit(100))
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
  { const need = needFor(section.data); if (need && !(await can(current, need))) return fail('Your role does not allow this. An administrator can change it in Settings.', 403) }

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
      nfcToken: crypto.randomUUID(),
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
    const clientId = parsed.data.clientId || null
    const [row] = await db.insert(sites).values({ ...current, ...parsed.data, clientId, status: 'active', createdAt: now }).returning()
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
    if (row.severity === 'high' || row.severity === 'critical') await raiseAlert({ userId: current.userId, organizationId: current.organizationId, type: 'incident', title: `${row.severity === 'critical' ? 'Critical' : 'High'} incident: ${row.title}`, body: `${row.site}: ${row.description.slice(0, 140)}`, severity: row.severity, key: `incident:${row.id}` })
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
  assigneeId: z.string().uuid().nullable().optional(),
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
  { const need = needFor(section); if (need && action !== 'acknowledge' && !(await can(current, need))) return fail('Your role does not allow this. An administrator can change it in Settings.', 403) }
  if (['suspend', 'reactivate', 'reissue-nfc', 'deactivate'].includes(action) && !(await isModerator(current))) return fail('Only an owner, admin or moderator can do this.', 403)
  let row: object | undefined
  let eventTitle = 'Record updated'
  let eventBody: string = action

  if (section === 'guards') {
    let changes: Partial<typeof guards.$inferInsert>
    if (action === 'suspend') changes = { status: 'suspended', suspendedAt: now }
    else if (action === 'reactivate') changes = { status: 'active', suspendedAt: null }
    else if (action === 'reissue-nfc') changes = { nfcToken: crypto.randomUUID() }
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
    else if (action === 'reactivate') changes = { status: 'active' }
    else if (action === 'update') changes = {
      clientId: parsed.data.clientId === undefined ? undefined : parsed.data.clientId || null,
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
    } else if (action === 'assign') {
      const [updated] = await db.update(incidents).set({
        assigneeId: parsed.data.assigneeId ?? null,
        timeline: [...record.timeline, `${now.toISOString()} Assigned`],
      }).where(where).returning()
      row = updated
      eventBody = 'Assigned'
    } else if (action === 'escalate' || action === 'resolve' || (action === 'update' && parsed.data.status)) {
      const status = action === 'escalate' ? 'escalated' : action === 'resolve' ? 'resolved' : parsed.data.status!
      const [updated] = await db.update(incidents).set({
        status,
        timeline: [...record.timeline, `${now.toISOString()} ${status}`],
      }).where(where).returning()
      row = updated
      eventBody = status
      if (action === 'escalate') await raiseAlert({ userId: current.userId, organizationId: current.organizationId, type: 'incident', title: `Escalated: ${record.title}`, body: `${record.site} incident was escalated`, severity: 'critical', key: `escalate:${record.id}` })
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

/** Permanent removal of a guard or site. Needs the "approve payroll" permission. Guards take their attendance, patrol and payroll history with them. */
export async function DELETE(request: Request) {
  if (!process.env.DATABASE_URL) return databaseUnavailable()
  const { current, response } = await getCurrentUser()
  if (response) return response
  if (!(await isModerator(current))) return fail('Only an owner, admin or moderator can delete records.', 403)
  const url = new URL(request.url)
  const section = url.searchParams.get('section')
  const id = url.searchParams.get('id') ?? ''
  if (!z.string().uuid().safeParse(id).success) return fail('Invalid id')
  const inOrg = (table: { organizationId: AnyPgColumn }) => eq(table.organizationId, current.organizationId)

  if (section === 'guards') {
    const [found] = await db.select({ name: guards.name }).from(guards).where(and(eq(guards.id, id), inOrg(guards))).limit(1)
    if (!found) return fail('Guard not found', 404)
    await db.transaction(async (tx) => {
      await tx.delete(attendance).where(and(eq(attendance.guardId, id), inOrg(attendance)))
      await tx.delete(patrols).where(and(eq(patrols.guardId, id), inOrg(patrols))) // checkpoints cascade
      await tx.delete(payrollRecords).where(and(eq(payrollRecords.guardId, id), inOrg(payrollRecords)))
      await tx.update(incidents).set({ assigneeId: null }).where(and(eq(incidents.assigneeId, id), inOrg(incidents)))
      await tx.delete(guards).where(and(eq(guards.id, id), inOrg(guards)))
    })
    await log(current, 'guard.deleted', `Guard deleted: ${found.name}`, 'Removed with their attendance, patrol and payroll history')
    return NextResponse.json({ ok: true })
  }
  if (section === 'sites') {
    const [found] = await db.select({ name: sites.name }).from(sites).where(and(eq(sites.id, id), inOrg(sites))).limit(1)
    if (!found) return fail('Site not found', 404)
    await db.transaction(async (tx) => {
      await tx.update(guards).set({ site: null }).where(and(eq(guards.site, found.name), inOrg(guards)))
      await tx.update(attendance).set({ siteId: null }).where(and(eq(attendance.siteId, id), inOrg(attendance)))
      await tx.update(patrols).set({ siteId: null }).where(and(eq(patrols.siteId, id), inOrg(patrols)))
      await tx.delete(sites).where(and(eq(sites.id, id), inOrg(sites))) // finances.siteId is set null by the foreign key
    })
    await log(current, 'site.deleted', `Site deleted: ${found.name}`, 'Guards at this site are now unassigned')
    return NextResponse.json({ ok: true })
  }
  return fail('Only guards and sites can be deleted.', 405)
}
