import { and, eq, ilike, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { alerts, guards, incidents, sites } from '@/lib/db/schema'
import { actor, denyGuard, fail } from '@/lib/server'
import { likeTerm } from '@/lib/pagination'
import { cachedJsonResponse } from '@/lib/cache'

export const dynamic = 'force-dynamic'

/** Fast organization-scoped lookup used by the workspace search bar. */
export async function GET(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in first.', 401)
  const denied = denyGuard(current); if (denied) return denied
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ hit: null })
  return cachedJsonResponse(`search:${current.organizationId}:${q.toLowerCase()}`, 10_000, async () => {
    const like = likeTerm(q)
    const organizationId = current.organizationId
    const [guard, site, incident, alert] = await Promise.all([
      db.select({ id: guards.id, name: guards.name }).from(guards).where(and(eq(guards.organizationId, organizationId), or(ilike(guards.name, like), ilike(guards.guardCode, like), ilike(guards.nin, like)))).limit(1),
      db.select({ id: sites.id, name: sites.name }).from(sites).where(and(eq(sites.organizationId, organizationId), or(ilike(sites.name, like), ilike(sites.address, like)))).limit(1),
      db.select({ id: incidents.id, name: incidents.title }).from(incidents).where(and(eq(incidents.organizationId, organizationId), or(ilike(incidents.title, like), ilike(incidents.site, like)))).limit(1),
      db.select({ id: alerts.id, name: alerts.title }).from(alerts).where(and(eq(alerts.organizationId, organizationId), or(ilike(alerts.title, like), ilike(alerts.body, like)))).limit(1),
    ])
    const hit = guard[0] ? { section: 'guards', label: guard[0].name } : site[0] ? { section: 'sites', label: site[0].name } : incident[0] ? { section: 'incidents', label: incident[0].name } : alert[0] ? { section: 'alerts', label: alert[0].name } : null
    return NextResponse.json({ hit, query: q })
  })
}
