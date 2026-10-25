import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { activityEvents, clients, guards, sites } from '@/lib/db/schema'
import { actor, denyGuard } from '@/lib/server'

const clientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
  phone: z.string().trim().max(50).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  monthlyValue: z.coerce.number().finite().nonnegative().max(1_000_000_000),
  slaScore: z.union([z.literal(''), z.coerce.number().finite().min(0).max(100)]).optional(),
  renewalDate: z.union([z.string().datetime(), z.literal('')]).optional(),
})

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

async function getCurrent() {
  if (!process.env.DATABASE_URL) return { response: error('Database is not configured.', 503) }
  const user = await actor()
  if (!user) return { response: error('Unauthorized', 401) }
  const denied = denyGuard(user)
  if (denied) return { response: denied }
  return { user }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (cause) {
    if (cause instanceof SyntaxError) return null
    throw cause
  }
}

export async function GET() {
  const { user, response } = await getCurrent()
  if (response) return response
  const rows = await db.select().from(clients)
    .where(eq(clients.organizationId, user.organizationId))
    .orderBy(desc(clients.createdAt))
    .limit(500)
  // Each client can own several sites; guards are counted through the sites they are assigned to.
  const [siteRows, guardRows] = await Promise.all([
    db.select({ id: sites.id, name: sites.name, status: sites.status, clientId: sites.clientId }).from(sites).where(eq(sites.organizationId, user.organizationId)),
    db.select({ site: guards.site }).from(guards).where(and(eq(guards.organizationId, user.organizationId), eq(guards.status, 'active'))),
  ])
  return NextResponse.json(rows.map((client) => {
    const owned = siteRows.filter((site) => site.clientId === client.id)
    const names = new Set(owned.map((site) => site.name))
    return { ...client, sites: owned.map((site) => ({ id: site.id, name: site.name, status: site.status })), guardCount: guardRows.filter((guard) => guard.site && names.has(guard.site)).length }
  }))
}

export async function POST(request: Request) {
  const { user, response } = await getCurrent()
  if (response) return response
  const parsed = clientSchema.safeParse(await readBody(request))
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Invalid client.')

  const now = new Date()
  const [row] = await db.insert(clients).values({
    userId: user.userId,
    organizationId: user.organizationId,
    ...parsed.data,
    contactName: parsed.data.contactName || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    slaScore: parsed.data.slaScore === '' ? null : parsed.data.slaScore ?? null,
    renewalDate: parsed.data.renewalDate ? new Date(parsed.data.renewalDate) : null,
    createdAt: now,
  }).returning()
  await db.insert(activityEvents).values({
    userId: user.userId,
    organizationId: user.organizationId,
    type: 'client.created',
    title: `Client added: ${row.name}`,
    body: 'A client account was added.',
    tone: 'neutral',
    createdAt: now,
  })
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(request: Request) {
  const { user, response } = await getCurrent()
  if (response) return response
  const body = await readBody(request)
  if (!body || typeof body !== 'object' || !('id' in body)) return error('Provide a client ID and update fields.')
  const id = z.string().uuid().safeParse(body.id)
  if (!id.success) return error('Invalid client ID.')
  const parsed = clientSchema.partial().safeParse(body)
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Invalid client update.')
  const input = parsed.data
  const changes: Partial<typeof clients.$inferInsert> = {
    name: input.name,
    contactName: input.contactName === undefined ? undefined : input.contactName || null,
    email: input.email === undefined ? undefined : input.email || null,
    phone: input.phone,
    status: input.status,
    monthlyValue: input.monthlyValue,
    slaScore: input.slaScore === undefined ? undefined : input.slaScore === '' ? null : input.slaScore,
    renewalDate: input.renewalDate === undefined ? undefined : input.renewalDate ? new Date(input.renewalDate) : null,
  }
  for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
    if (changes[key] === undefined) delete changes[key]
  }
  if (!Object.keys(changes).length) return error('Provide at least one client field to update.')

  const [row] = await db.update(clients).set(changes).where(and(
    eq(clients.id, id.data),
    eq(clients.organizationId, user.organizationId),
  )).returning()
  if (!row) return error('Client not found in this organization.', 404)
  await db.insert(activityEvents).values({
    userId: user.userId,
    organizationId: user.organizationId,
    type: 'client.updated',
    title: `Client updated: ${row.name}`,
    body: 'Client account details were updated.',
    tone: 'neutral',
    createdAt: new Date(),
  })
  return NextResponse.json(row)
}
