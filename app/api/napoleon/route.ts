import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { memberRole } from '@/lib/server'

async function isAuthenticated() {
  const session = await auth.api.getSession({ headers: await headers() })
  const orgId = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId
  if (!session?.user || !orgId) return false
  const role = await memberRole(orgId, session.user.id)
  return Boolean(role) && role !== 'guard'
}

function configuration() {
  const baseUrl = process.env.NAPOLEON_API_URL?.replace(/\/+$/, '')
  const apiKey = process.env.NAPOLEON_API_KEY
  return baseUrl && apiKey ? { baseUrl, apiKey } : null
}

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = configuration()
  if (!config) return NextResponse.json({ error: 'Napoleon is not configured' }, { status: 503 })

  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey },
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

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = configuration()
  if (!config) return NextResponse.json({ error: 'Napoleon is not configured' }, { status: 503 })

  let body: { messages?: Array<{ role?: string; content?: string }>; model?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 30) {
    return NextResponse.json({ error: 'Provide between 1 and 30 chat messages' }, { status: 400 })
  }

  const messages = body.messages.map(({ role, content }) => {
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > 4000) {
      return null
    }
    return { role, content: content.trim() }
  })

  if (messages.some((message) => message === null)) {
    return NextResponse.json({ error: 'Each message must have a user or assistant role and 1–4000 characters of content' }, { status: 400 })
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: body.model ?? 'napoleon-1', messages }),
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
