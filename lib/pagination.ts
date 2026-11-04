/** Shared offset pagination contract for list endpoints and their UIs. */
export type PageRequest = { page: number; pageSize: number; offset: number }

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export function readPage(url: URL, fallbackSize = DEFAULT_PAGE_SIZE): PageRequest {
  const rawPage = Number(url.searchParams.get('page') ?? '1')
  const rawSize = Number(url.searchParams.get('pageSize') ?? String(fallbackSize))
  const pageSize = Number.isFinite(rawSize) ? Math.min(MAX_PAGE_SIZE, Math.max(5, Math.floor(rawSize))) : fallbackSize
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export type PageResponse<T, S = Record<string, number>> = {
  rows: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  stats?: S
}

export function pageResponse<T, S extends Record<string, number>>(
  rows: T[],
  total: number,
  page: PageRequest,
  stats?: S,
): PageResponse<T, S> {
  return {
    rows,
    page: page.page,
    pageSize: page.pageSize,
    total,
    hasMore: page.offset + rows.length < total,
    ...(stats ? { stats } : {}),
  }
}

/** Escapes % and _ so a search term is treated literally by ILIKE. */
export function likeTerm(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}
