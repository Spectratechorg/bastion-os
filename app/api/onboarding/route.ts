import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'

const input = z.object({ name: z.string().trim().min(2).max(80) })

/** Creates the user's first organization and makes it the active one. */
export async function POST(request: Request) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  if ((session.session as { activeOrganizationId?: string }).activeOrganizationId) return NextResponse.json({ ok: true })
  const existing = await auth.api.listOrganizations({ headers: requestHeaders })
  if (existing.length > 0) { await auth.api.setActiveOrganization({ body: { organizationId: existing[0].id }, headers: requestHeaders }); return NextResponse.json({ ok: true }) }
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter your company name.' }, { status: 400 })
  const slug = `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 6)}`
  const organization = await auth.api.createOrganization({ body: { name: parsed.data.name, slug }, headers: requestHeaders })
  if (!organization?.id) return NextResponse.json({ error: 'Could not create the organization.' }, { status: 500 })
  await auth.api.setActiveOrganization({ body: { organizationId: organization.id }, headers: requestHeaders })
  return NextResponse.json({ ok: true })
}
