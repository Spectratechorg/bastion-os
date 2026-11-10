'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Page numbers with a gap marker, so long lists stay legible. */
function pageItems(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const wanted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b)
  const items: (number | 'gap')[] = []
  let previous = 0
  for (const value of wanted) {
    if (value - previous > 1) items.push('gap')
    items.push(value)
    previous = value
  }
  return items
}

/** Footer used under every paginated list. Offset pagination, server-driven. */
export function Pagination({ page, pageSize, total, onPage, onPageSize, busy = false }: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  busy?: boolean
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const items = pageItems(page, pages)

  const arrow = 'flex size-8 items-center justify-center rounded-[7px] text-[#3F3F46] transition-colors hover:bg-[#F0F0F1] disabled:pointer-events-none disabled:opacity-35'

  return (
    <div className="flex flex-col gap-3 border-t border-[#E4E4E7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p aria-live="polite" className="text-[10.5px] text-[#6B6B72]">
          <span className="font-mono tabular-nums text-[#18181B]">{from}–{to}</span> of <span className="font-mono tabular-nums text-[#18181B]">{total}</span>
        </p>
        <label className="flex items-center gap-1.5 text-[10.5px] text-[#6B6B72]">
          <span className="sr-only">Rows per page</span>
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[6px] border border-[#E4E4E7] bg-white pl-2 pr-1 text-[10.5px] text-[#3F3F46] transition-colors hover:border-[#D4D4D8] disabled:opacity-50"
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </label>
      </div>

      {pages > 1 && <nav aria-label="Pagination" className="flex items-center gap-1.5 self-end sm:self-auto">
        <button type="button" aria-label="Previous page" className={arrow} onClick={() => onPage(page - 1)} disabled={busy || page <= 1}>
          <ChevronLeft className="size-4" />
        </button>

        <span className="px-1 text-[10.5px] text-[#6B6B72] sm:hidden">
          Page <span className="font-mono tabular-nums text-[#18181B]">{page}</span> of {pages}
        </span>

        <div className="hidden items-center gap-0.5 sm:flex">
          {items.map((item, index) => item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden className="flex size-8 items-end justify-center pb-1.5 text-[11px] text-[#9A9AA1]">…</span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              disabled={busy}
              onClick={() => onPage(item)}
              className={`min-w-8 rounded-[7px] px-2 py-1.5 font-mono text-[11px] tabular-nums transition-colors disabled:opacity-50 ${item === page ? 'bg-[#2A2B2E] font-semibold text-white' : 'text-[#3F3F46] hover:bg-[#F0F0F1]'}`}
            >
              {item}
            </button>
          ))}
        </div>

        <button type="button" aria-label="Next page" className={arrow} onClick={() => onPage(page + 1)} disabled={busy || page >= pages}>
          <ChevronRight className="size-4" />
        </button>
      </nav>}
    </div>
  )
}
