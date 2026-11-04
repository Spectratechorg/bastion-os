'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'

export function Badge({ value }: { value: unknown }) {
  const text = String(value ?? '—')
  const tone = /critical|high|suspended|flagged|outside|escalated|missed|unacknowledged|overdue/i.test(text) ? 'bg-[#FDECEA] text-[#B42318]'
    : /medium|pending|open|inactive|in_progress|in progress|investigating|restock|due soon/i.test(text) ? 'bg-[#FEF3E2] text-[#B7791F]'
    : /paid|completed|approved|active|resolved|inside|acknowledged|low/i.test(text) ? 'bg-[#E3F4EA] text-[#16794A]' : 'bg-[#EFEFF1] text-[#52525B]'
  return <span className={`inline-flex items-center whitespace-nowrap rounded-[6px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.06em] ${tone}`}>{text.replace('_', ' ')}</span>
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  }
  return <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-[#E4E4E7] text-[10.5px] font-bold tracking-[0.02em] text-[#3F3F46]">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-12 text-[11px] text-[#6B6B72]"><LoaderCircle className="size-4 animate-spin text-[#6B6B72]" />{label}</div>
}

export function ErrorBanner({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null
  return <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-[10px] border border-red-200 bg-[#FDECEA] px-3.5 py-2.5 text-[12px] text-[#B42318]">{message}{retry && <button onClick={retry} className="min-h-[32px] shrink-0 text-[11px] font-semibold underline underline-offset-2">Retry</button>}</div>
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="px-4 py-12 text-center"><p className="text-[13px] font-semibold text-[#18181B]">{title}</p>{text && <p className="mx-auto mt-1 max-w-[46ch] text-[11.5px] leading-relaxed text-[#6B6B72]">{text}</p>}</div>
}

export const inputClass = 'h-10 w-full rounded-[8px] border border-[#E4E4E7] bg-white px-3 text-[13px] text-[#18181B] outline-none transition-colors placeholder:text-[#9A9AA1] focus:border-[#2A2B2E] focus:ring-2 focus:ring-[#2A2B2E]/10'
export const btn = 'inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#E4E4E7] bg-white px-3 text-[11.5px] font-semibold text-[#3F3F46] transition-colors hover:border-[#D4D4D8] hover:bg-[#F5F5F6] disabled:opacity-50 disabled:hover:bg-white sm:h-9'
export const btnPrimary = 'inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#2A2B2E] px-3.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#3F4045] disabled:opacity-50 sm:h-9'
export const smallBtn = 'inline-flex min-h-[32px] items-center justify-center gap-1 rounded-[7px] border border-[#E4E4E7] bg-white px-2.5 text-[10.5px] font-semibold text-[#3F3F46] transition-colors hover:border-[#D4D4D8] hover:bg-[#F5F5F6] disabled:opacity-50'

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6B6B72]">{label}{children}{hint && <span className="text-[10px] font-normal normal-case tracking-normal text-[#9A9AA1]">{hint}</span>}</label>
}

/** Right-hand drawer on desktop, full-screen on phones. */
export function Sheet({ title, kicker, onClose, children, footer }: { title: string; kicker?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-label={title} className="flex h-full w-full flex-col bg-white shadow-[0_20px_60px_-20px_rgba(11,18,15,0.45)] sm:max-w-[480px]">
        <header className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-4"><div>{kicker && <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#9A9AA1]">{kicker}</p>}<h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[#18181B]">{title}</h2></div><button onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-[8px] text-[#6B6B72] transition-colors hover:bg-[#F0F2EC]"><X className="size-4.5" /></button></header>
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-[#E4E4E7] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </section>
    </div>
  )
}
