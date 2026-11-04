'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { smallBtn } from '@/components/ui-bits'

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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E4E7] px-4 py-3 text-[10.5px] text-[#6B6B72]">
      <p aria-live="polite">
        Showing <span className="font-mono tabular-nums text-[#18181B]">{from}–{to}</span> of <span className="font-mono tabular-nums text-[#18181B]">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Rows per page</span>
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            disabled={busy}
            className="h-8 rounded-[6px] border border-[#E4E4E7] bg-white px-1.5 text-[10.5px] text-[#3F3F46]"
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </label>
        <button type="button" aria-label="Previous page" className={smallBtn} onClick={() => onPage(page - 1)} disabled={busy || page <= 1}>
          <ChevronLeft className="size-3.5" /> Previous
        </button>
        <span className="whitespace-nowrap font-mono tabular-nums text-[#3F3F46]">{page} / {pages}</span>
        <button type="button" aria-label="Next page" className={smallBtn} onClick={() => onPage(page + 1)} disabled={busy || page >= pages}>
          Next <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
