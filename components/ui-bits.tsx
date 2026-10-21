'use client'

import { useEffect } from 'react'
import { LoaderCircle, X } from 'lucide-react'

export function Badge({ value }: { value: unknown }) {
  const text = String(value ?? '—')
  const tone = /critical|high|suspended|flagged|outside|escalated|missed|unacknowledged/i.test(text) ? 'bg-[#FDECEA] text-[#B42318]'
    : /medium|pending|open|inactive|in_progress|in progress|investigating/i.test(text) ? 'bg-[#FEF3E2] text-[#B7791F]'
    : /paid|completed|approved|active|resolved|inside|acknowledged|low/i.test(text) ? 'bg-[#E3F4EA] text-[#16794A]' : 'bg-[#EFEFF1] text-[#52525B]'
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${tone}`}>{text.replace('_', ' ')}</span>
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  return <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-[#E4E4E7] text-[11px] font-semibold text-zinc-700">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-12 text-xs text-zinc-500"><LoaderCircle className="size-4 animate-spin" />{label}</div>
}

export function ErrorBanner({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null
  return <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{message}{retry && <button onClick={retry} className="min-h-[36px] font-semibold underline">Retry</button>}</div>
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="px-4 py-12 text-center"><p className="text-sm font-semibold">{title}</p>{text && <p className="mt-1 text-xs text-zinc-500">{text}</p>}</div>
}

export const inputClass = 'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-500'
export const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 sm:h-10'
export const btnPrimary = 'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#2A2B2E] px-3.5 text-xs font-semibold text-white hover:bg-[#3F4045] disabled:opacity-60 sm:h-10'
export const smallBtn = 'inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60'

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-zinc-700">{label}{children}{hint && <span className="text-[10px] font-normal text-zinc-500">{hint}</span>}</label>
}

/** Right-hand drawer on desktop, full-screen on phones. */
export function Sheet({ title, kicker, onClose, children, footer }: { title: string; kicker?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-label={title} className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[480px]">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4"><div>{kicker && <p className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500">{kicker}</p>}<h2 className="text-lg font-medium">{title}</h2></div><button onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"><X className="size-5" /></button></header>
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </section>
    </div>
  )
}
