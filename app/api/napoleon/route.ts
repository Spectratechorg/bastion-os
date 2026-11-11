import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { type Actor, memberRole } from '@/lib/server'
import { db } from '@/lib/db'
import { members } from '@/lib/db/schema'
import { buildOperationalContext, executeNapoleonTool, NAPOLEON_TOOLS } from '@/lib/napoleon-context'

export const dynamic = 'force-dynamic'

function cleanEnv(val: string | undefined): string | undefined {
  if (!val) return undefined
  const cleaned = val.replace(/[\r\n\t]/g, '').trim().replace(/^["']|["']$/g, '')
  return cleaned.length > 0 ? cleaned : undefined
}

async function getSessionInfo(): Promise<{ userId: string; orgId: string; role: string } | null> {
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
  return { userId: session.user.id, orgId, role }
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

type ToolCallPayload = {
  id: string
  type?: string
  function: { name: string; arguments: string }
}

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCallPayload[]
  tool_call_id?: string
  reasoning_content?: string | null
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: ToolCallPayload[]
      reasoning_content?: string | null
    }
  }>
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
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
 * Chat completion: routed directly to DeepSeek with full BastionOS operational & HR/payroll context and read-only DB query tools.
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
      const currentActor: Actor = {
        userId: session.userId,
        organizationId: session.orgId,
        role: session.role,
      }
      const { context: liveContext, canViewFinance } = await buildOperationalContext(currentActor)

      const systemPrompt: DeepSeekMessage = {
        role: 'system',
        content: `You are Napoleon, an elite operational intelligence, HR/payroll, and tactical assistant embedded inside BastionOS.
You assist security commanders, operations managers, administrators, and supervisors with site security, guard deployment, guard salaries & payroll, finances, client contracts, patrol oversight, attendance, equipment inventory, and incident response.

Instructions:
- Tone: Concise, professional, tactical, and authoritative.
- Grounding: Always base answers directly on the live BastionOS database context and read-only query tools provided. Never guess or claim tables are missing when data or tools exist below.
- Exact Calculations & Filtering: Whenever answering questions that count, filter, sum, average, rank, or check salary thresholds (e.g., how many guards earn above ₦60,000), payroll totals, attendance breaches, or historical dates, invoke the appropriate query tool (query_guards, query_payroll, query_finances_and_contracts, query_attendance_and_patrols, query_alerts_incidents_inventory) to compute exact verified results from PostgreSQL.
- Permissions: ${canViewFinance ? 'This user has viewFinance permission and is authorized to view guard salaries, office staff salaries, payroll totals, finances, and contract values.' : 'This user does NOT have viewFinance permission; explain clearly that salary, payroll, and finance figures require viewFinance permission.'}
- Privacy & Formatting: Never display raw NINs or authentication tokens. Format Naira amounts with ₦ and thousands separators.

${liveContext}`.trim(),
      }

      const conversation: DeepSeekMessage[] = [
        systemPrompt,
        ...cleanMessages.map((msg) => ({ role: msg!.role, content: msg!.content })),
      ]

      const MAX_TOOL_ROUNDS = 4
      let useTools = true

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const allowToolsThisTurn = useTools && round < MAX_TOOL_ROUNDS
        const payload = {
          model: deepseek.model,
          messages: conversation,
          ...(allowToolsThisTurn ? { tools: NAPOLEON_TOOLS, tool_choice: 'auto' } : {}),
          temperature: 0.2,
          max_tokens: 1500,
        }

        const response = await fetch(`${deepseek.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deepseek.apiKey}`,
          },
          body: JSON.stringify(payload),
          cache: 'no-store',
          signal: AbortSignal.timeout(25000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          if (allowToolsThisTurn && response.status === 400 && /tool/i.test(errorText)) {
            useTools = false
            continue
          }
          console.error('[Napoleon API - DeepSeek Error]', response.status, errorText)
          return NextResponse.json(
            { error: `Napoleon AI error (${response.status}): ${errorText}` },
            { status: 502 },
          )
        }

        const data = (await response.json()) as DeepSeekResponse
        const assistantMsg = data.choices?.[0]?.message
        const toolCalls = assistantMsg?.tool_calls

        if (!allowToolsThisTurn || !Array.isArray(toolCalls) || toolCalls.length === 0) {
          return NextResponse.json(data)
        }

        conversation.push({
          role: 'assistant',
          content: assistantMsg?.content ?? null,
          tool_calls: toolCalls,
          ...(assistantMsg?.reasoning_content !== undefined ? { reasoning_content: assistantMsg.reasoning_content } : {}),
        })

        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            const args = safeParseArgs(tc.function.arguments)
            const result = await executeNapoleonTool(tc.function.name, args, currentActor, canViewFinance)
            return {
              role: 'tool' as const,
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            }
          }),
        )

        conversation.push(...toolResults)
      }

      return NextResponse.json({ error: 'Napoleon exceeded tool execution rounds without producing a response.' }, { status: 502 })
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
