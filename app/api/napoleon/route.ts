import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NAPOLEON_API_URL
  const apiKey = process.env.NAPOLEON_API_KEY
  if (!baseUrl || !apiKey) return NextResponse.json({ error: 'Napoleon is not configured' }, { status: 503 })
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, { headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey }, cache: 'no-store' })
  const text = await response.text()
  return new NextResponse(text, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' } })
}

export async function POST(request: Request) {
  const baseUrl = process.env.NAPOLEON_API_URL
  const apiKey = process.env.NAPOLEON_API_KEY
  if (!baseUrl || !apiKey) return NextResponse.json({ error: 'Napoleon is not configured' }, { status: 503 })
  const body = await request.json()
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await response.text()
  return new NextResponse(text, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' } })
}
