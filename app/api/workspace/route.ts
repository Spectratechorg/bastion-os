import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { activityEvents, members, organizations, users } from '@/lib/db/schema'
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizationId = session.session.activeOrganizationId
  if (!organizationId) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })

  const [membership] = await db.select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, session.user.id)))
    .limit(1)
  if (!membership) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })

  const [[organization], team, activity] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select({
      id: members.id,
      name: users.name,
      email: users.email,
      role: members.role,
      joinedAt: members.createdAt,
    }).from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.organizationId, organizationId))
      .orderBy(desc(members.createdAt))
      .limit(250),
    db.select({
      id: activityEvents.id,
      title: activityEvents.title,
      body: activityEvents.body,
      type: activityEvents.type,
      createdAt: activityEvents.createdAt,
    }).from(activityEvents)
      .where(eq(activityEvents.organizationId, organizationId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(50),
  ])

  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
  return NextResponse.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image, role: membership.role },
    organization,
    members: team,
    activity,
  })
}

/** Rename the active organization. */
export async function PATCH(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizationId = session.session.activeOrganizationId
  if (!organizationId) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: 'Organization name must be 2–120 characters.' }, { status: 400 })

  const [membership] = await db.select({ role: members.role }).from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, session.user.id))).limit(1)
  if (!membership || !['owner', 'admin'].includes(membership.role.toLowerCase())) {
    return NextResponse.json({ error: 'Only an owner or administrator can rename the organization.' }, { status: 403 })
  }

  const [organization] = await db.update(organizations).set({ name }).where(eq(organizations.id, organizationId))
    .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug })
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
  await db.insert(activityEvents).values({
    userId: session.user.id,
    organizationId,
    type: 'organization.renamed',
    title: `Organization renamed to ${organization.name}`,
    body: 'Updated in settings.',
    tone: 'neutral',
    createdAt: new Date(),
  })
  return NextResponse.json(organization)
}
