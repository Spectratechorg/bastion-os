import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { memberRole } from '@/lib/server'
import { db } from '@/lib/db'
import { sites, guards, alerts, incidents, members } from '@/lib/db/schema'

function cleanEnv(val: string | undefined): string | undefined {
  if (!val) return undefined
  const cleaned = val.replace(/[\r\n\t]/g, '').trim().replace(/^["']|["']$/g, '')
  return cleaned.length > 0 ? cleaned : undefined
}

async function getSessionInfo() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  let orgId = (session.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  if (!orgId) {
    try {
      const [membership] = await db
        .select({ organizationId: members.organizationId })
        .from(members)
        .where(eq(members.userId, session.user.id))
        .limit(1)
      orgId = membership?.organizationId
    } catch {
      // Continue without orgId if DB query fails
    }
  }
  if (!orgId) return null
  const role = await memberRole(orgId, session.user.id)
  if (!role || role === 'guard') return null
  return { user: session.user, orgId, role }
}

function getDeepSeekConfig() {
  const apiKey = cleanEnv(process.env.DEEPSEEK_API_KEY)
  const model = cleanEnv(process.env.DEEPSEEK_MODEL) || 'deepseek-chat'
  const baseUrl = (cleanEnv(process.env.DEEPSEEK_BASE_URL) || 'https://api.deepseek.com').replace(/\/+$/, '')
  return apiKey ? { apiKey, model, baseUrl } : null
}

function getLegacyNapoleonConfig() {
  const baseUrl = cleanEnv(process.env.NAPOLEON_API_URL)?.replace(/\/+$/, '')
  const apiKey = cleanEnv(process.env.NAPOLEON_API_KEY)
  return baseUrl && apiKey ? { baseUrl, apiKey } : null
}

/**
 * Builds live operational intelligence from Supabase for this organization
 * to supply Napoleon (DeepSeek) with real operational context.
 */
async function buildOperationalContext(orgId: string): Promise<string> {
  try {
    const [orgSites, orgGuards, recentAlerts, recentIncidents] = await Promise.all([
      db
        .select({
          name: sites.name,
          dangerLevel: sites.dangerLevel,
          status: sites.status,
          geofenceRadius: sites.geofenceRadius,
        })
        .from(sites)
        .where(eq(sites.organizationId, orgId))
        .limit(15),
      db
        .select({
          name: guards.name,
          status: guards.status,
          site: guards.site,
          lastCheckIn: guards.lastCheckIn,
        })
        .from(guards)
        .where(eq(guards.organizationId, orgId))
        .limit(20),
      db
        .select({
          title: alerts.title,
          body: alerts.body,
          type: alerts.type,
        })
        .from(alerts)
        .where(eq(alerts.organizationId, orgId))
        .orderBy(desc(alerts.createdAt))
        .limit(5),
      db
        .select({
          title: incidents.title,
          severity: incidents.severity,
          status: incidents.status,
          site: incidents.site,
        })
        .from(incidents)
        .where(eq(incidents.organizationId, orgId))
        .orderBy(desc(incidents.reportedAt))
        .limit(5),
    ])

    const sitesText =
      orgSites.length > 0
        ? orgSites.map((s) => `- ${s.name}: ${s.dangerLevel} risk, status: ${s.status}, geofence: ${s.geofenceRadius}m`).join('\n')
        : 'No sites recorded yet.'

    const guardsText =
      orgGuards.length > 0
        ? `Total guards: ${orgGuards.length}. Highlights:\n` +
          orgGuards.map((g) => `- ${g.name}: ${g.status} at ${g.site ?? 'Unassigned'}`).join('\n')
        : 'No guards registered yet.'

    const alertsText =
      recentAlerts.length > 0
        ? recentAlerts.map((a) => `- [${a.type}] ${a.title}: ${a.body}`).join('\n')
        : 'None (all clear).'

    const incidentsText =
      recentIncidents.length > 0
        ? recentIncidents.map((i) => `- [${i.severity}] ${i.title} at ${i.site} (${i.status})`).join('\n')
        : 'None recorded recently.'

    return `
LIVE BASTIONOS DATABASE CONTEXT:
[Active Sites]
${sitesText}

[Personnel & Guards]
${guardsText}

[Recent Alerts]
${alertsText}

[Recent Incidents]
${incidentsText}
`.trim()
  } catch (err) {
    console.warn('[Napoleon API] Could not load operational context from DB:', err)
    return 'Operational context currently unavailable.'
  }
}

/**
 * Health check: reports connected if DeepSeek or Napoleon is configured.
 */
export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const deepseek = getDeepSeekConfig()
  if (deepseek) {
    return NextResponse.json({
      ok: true,
      provider: 'deepseek',
      model: deepseek.model,
      message: 'Napoleon is connected and powered by DeepSeek AI',
    })
  }

  const legacy = getLegacyNapoleonConfig()
  if (!legacy) {
    return NextResponse.json({ error: 'Neither DeepSeek nor Napoleon is configured' }, { status: 503 })
  }

  try {
    const response = await fetch(`${legacy.baseUrl}/health`, {
      headers: { Authorization: `Bearer ${legacy.apiKey}`, 'x-api-key': legacy.apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    const text = await response.text()
    return new NextResponse(text, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Napoleon service is unreachable' }, { status: 502 })
  }
}

/**
 * Chat completion: routed directly to DeepSeek when configured.
 */
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { messages?: Array<{ role?: string; content?: string }>; model?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 30) {
    return NextResponse.json({ error: 'Provide between 1 and 30 chat messages' }, { status: 400 })
  }

  const cleanMessages = body.messages.map(({ role, content }) => {
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > 4000) {
      return null
    }
    return { role: role as 'user' | 'assistant', content: content.trim() }
  })

  if (cleanMessages.some((msg) => msg === null)) {
    return NextResponse.json({ error: 'Each message must have a user or assistant role and 1–4000 characters of content' }, { status: 400 })
  }

  const deepseek = getDeepSeekConfig()

  // 1. Direct DeepSeek Execution (Preferred)
  if (deepseek) {
    try {
      const liveContext = await buildOperationalContext(session.orgId)

      const systemPrompt = {
        role: 'system',
        content: `You are Napoleon, an elite operational intelligence and tactical assistant embedded inside BastionOS.
You assist security commanders, operations managers, and supervisors with site security, guard deployment, patrol oversight, and incident response.

Instructions:
- Tone: Concise, professional, tactical, and authoritative.
- Answers: Be direct and practical. If referencing sites or guards, cite the real operational data provided below.
- Analysis: When asked about coverage gaps or high risks, actively evaluate the live sites, danger levels, and guard assignments.

${liveContext}
`.trim(),
      }

      const response = await fetch(`${deepseek.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseek.apiKey}`,
        },
        body: JSON.stringify({
          model: deepseek.model,
          messages: [systemPrompt, ...cleanMessages],
          temperature: 0.3,
          max_tokens: 1500,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Napoleon API - DeepSeek Error]', response.status, errorText)
        return NextResponse.json(
          { error: `Napoleon AI error (${response.status}): ${errorText}` },
          { status: 502 }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (err) {
      console.error('[Napoleon API] DeepSeek request failed:', err)
      return NextResponse.json({ error: 'DeepSeek service request failed' }, { status: 502 })
    }
  }

  // 2. Legacy Napoleon fallback (if DeepSeek is not configured)
  const legacy = getLegacyNapoleonConfig()
  if (!legacy) return NextResponse.json({ error: 'Neither DeepSeek nor Napoleon is configured' }, { status: 503 })

  try {
    const response = await fetch(`${legacy.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${legacy.apiKey}`,
        'x-api-key': legacy.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: body.model ?? 'napoleon-1', messages: cleanMessages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const text = await response.text()
    return new NextResponse(text, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Napoleon service is unreachable' }, { status: 502 })
  }
}
