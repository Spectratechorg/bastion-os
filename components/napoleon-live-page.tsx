'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type Connection = 'checking' | 'connected' | 'not-configured' | 'unavailable'

const suggestions = [
  "Where are today's coverage gaps?",
  'Which sites have the highest risk?',
  'Which guards need attention?',
]

function modelForPrompt(prompt: string) {
  if (/\b(risk|site|sites|hotspot|coverage)\b/i.test(prompt)) return 'napoleon-risk'
  if (/\b(guard|guards|officer|personnel|staff)\b/i.test(prompt)) return 'napoleon-guards'
  return 'napoleon-1'
}

export function NapoleonLivePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [connection, setConnection] = useState<Connection>('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/napoleon', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        setConnection(response.ok ? 'connected' : response.status === 503 ? 'not-configured' : 'unavailable')
        if (!response.ok && payload.error) setError(payload.error)
      })
      .catch(() => {
        setConnection('unavailable')
        setError('Unable to check the Napoleon service connection.')
      })
  }, [])

  async function send(promptValue: string) {
    const prompt = promptValue.trim()
    if (!prompt || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: prompt }]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/napoleon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelForPrompt(prompt), messages: nextMessages }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Napoleon request failed.')

      const answer = payload.choices?.[0]?.message?.content
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Napoleon returned no analysis.')

      setMessages((current) => [...current, { role: 'assistant', content: answer }])
      setConnection('connected')
    } catch (cause) {
      setConnection('unavailable')
      setError(cause instanceof Error ? cause.message : 'Napoleon request failed.')
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send(input)
  }

  const statusLabel =
    connection === 'checking' ? 'Checking Napoleon…' :
      connection === 'connected' ? 'Napoleon connected' :
        connection === 'not-configured' ? 'Napoleon not configured' : 'Napoleon unavailable'
  const statusTone = connection === 'connected' ? 'bg-[#E8E8EA] text-[#18181B]' : 'bg-[#FEF3E2] text-[#B7791F]'

  return (
    <>
      <PageHeader title="Napoleon AI" subtitle="Operational intelligence from the configured Napoleon service." action={<span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone}`}>{statusLabel}</span>} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="flex min-h-[610px] flex-col rounded-[20px] border border-[#E4E4E7] bg-white">
          <header className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-600 to-zinc-950 font-serif italic text-white">N</span>
            <span className="flex-1"><b className="block text-xs">Napoleon</b><small className="text-[10px] text-zinc-500">Deterministic operational analysis</small></span>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-950 font-serif text-2xl italic text-white">N</span>
            <h2 className="mt-4 text-[22px] font-normal">How can I help your operation?</h2>
            <p className="mt-2 text-xs text-zinc-500">Ask about attendance, incidents, patrols, sites or guard performance.</p>
            <div className="mt-4 flex w-full max-w-2xl flex-col gap-3">
              {messages.map((message, index) => (
                <p key={`${message.role}-${index}`} className={`rounded-xl px-4 py-3 text-left text-xs leading-5 ${message.role === 'user' ? 'ml-auto max-w-[85%] bg-zinc-100' : 'mr-auto max-w-[95%] whitespace-pre-wrap bg-[#F5F5F6]'}`}>
                  {message.content}
                </p>
              ))}
            </div>
            {loading && <p className="mt-3 text-xs text-zinc-500">Napoleon is analyzing…</p>}
            {error && <p role="alert" className="mt-3 max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-900">{error}</p>}
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => void send(suggestion)} disabled={loading} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-semibold disabled:opacity-50">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={submit} className="mx-4 mb-1 flex h-[50px] items-center rounded-xl border border-zinc-200 px-2">
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Napoleon anything about your operation…" className="min-w-0 flex-1 px-2 text-xs outline-none" />
            <button disabled={loading || !input.trim()} aria-label="Send message" className="flex size-10 items-center justify-center rounded-lg bg-[#2A2B2E] text-white disabled:opacity-50"><Send className="size-4" /></button>
          </form>
          <p className="pb-3 text-center text-[9px] text-zinc-400">Napoleon's output is deterministic operational analysis. Review findings before acting.</p>
        </section>
        <aside className="rounded-2xl border border-[#E4E4E7] bg-white p-4">
          <h2 className="text-sm font-semibold">Before you ask</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-600">Napoleon analyzes records ingested into its own database. Connecting the chat API does not automatically synchronize BastionOS records.</p>
          <p className="mt-3 text-xs leading-5 text-zinc-600">The service API key stays on the server and is never sent to the browser.</p>
        </aside>
      </div>
    </>
  )
}
