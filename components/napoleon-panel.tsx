'use client'

import { FormEvent, useState } from 'react'
import { BrainCircuit, Send, X } from 'lucide-react'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function NapoleonPanel() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Napoleon is connected. Ask about attendance, incidents, patrol completion, or anomalies.' }])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const prompt = query.trim()
    if (!prompt || loading) return
    setQuery('')
    const next = [...messages, { role: 'user' as const, content: prompt }]
    setMessages(next)
    setLoading(true)
    try {
      const response = await fetch('/api/napoleon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Napoleon request failed')
      const answer = payload.choices?.[0]?.message?.content ?? payload.message ?? payload.content ?? 'Napoleon returned no analysis.'
      setMessages((current) => [...current, { role: 'assistant', content: typeof answer === 'string' ? answer : JSON.stringify(answer) }])
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Napoleon is temporarily unavailable.' }])
    } finally { setLoading(false) }
  }

  return <><button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-[#173f37] px-4 py-3 text-xs font-semibold text-white shadow-xl transition hover:bg-[#245b4d]" aria-label="Open Napoleon AI"><BrainCircuit className="size-4" />Ask Napoleon</button>{open && <section className="fixed bottom-5 right-5 z-40 flex h-[430px] w-[min(370px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#d7e2dd] bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#173f37] px-4 py-3 text-white"><div><p className="text-sm font-semibold">Napoleon AI</p><p className="text-[10px] text-[#b8d8cd]">Live operational analysis</p></div><button onClick={() => setOpen(false)} aria-label="Close Napoleon" className="rounded-md p-1 hover:bg-white/10"><X className="size-4" /></button></header><div className="flex-1 overflow-y-auto bg-[#f7faf8] p-3"><div className="flex flex-col gap-3">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'ml-auto bg-[#dfede8] text-[#173f37]' : 'bg-white text-[#52635e] shadow-sm'}`}>{message.content}</div>)}{loading && <div className="text-xs text-[#81918b]">Napoleon is analyzing live data…</div>}</div></div><form onSubmit={submit} className="flex gap-2 border-t border-[#e5ece8] bg-white p-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about operations…" className="min-w-0 flex-1 rounded-lg border border-[#dbe5e0] px-3 py-2 text-xs outline-none focus:border-[#4f8d79]" aria-label="Ask Napoleon a question" /><button disabled={loading || !query.trim()} aria-label="Send question" className="rounded-lg bg-[#df7b48] px-3 text-white disabled:opacity-50"><Send className="size-4" /></button></form></section>}</>
}
