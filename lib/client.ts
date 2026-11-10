export class ApiError extends Error {}

/**
 * Client-side GET cache. Navigating back to a page inside the TTL is instant, and overlapping
 * requests (the shell and the page both asking for alerts, for example) share one flight.
 * A mutation clears the cache so the next read sees the new state.
 */
const CLIENT_TTL_MS = 20_000
const cache = new Map<string, { value: unknown; expires: number }>()
const inflight = new Map<string, Promise<unknown>>()
let lastMutationAt = 0

/** Drops the GET cache so the next read goes to the network (used by explicit Refresh buttons). */
export function clearClientCache() { cache.clear() }

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown; ttl?: number } = {}): Promise<T> {
  const { json, ttl: requestedTtl, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()
  const cacheable = method === 'GET' && !json && !rest.body
  const ttl = requestedTtl ?? CLIENT_TTL_MS
  const now = Date.now()

  if (cacheable && ttl > 0 && now - lastMutationAt > 1_500) {
    const hit = cache.get(url)
    if (hit && hit.expires > now) return hit.value as T
    const pending = inflight.get(url)
    if (pending) return pending as T
  }

  const request = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          ...rest,
          headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...rest.headers },
          body: json ? JSON.stringify(json) : rest.body,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new ApiError((body as { error?: string }).error ?? 'Something went wrong. Please try again.')
        return body as T
      } catch (error) {
        // A network failure (not an HTTP error) is usually a restarted server or a dropped
        // connection. Reads retry quietly for a few seconds; writes are never retried.
        const network = error instanceof TypeError
        if (!network || method !== 'GET' || attempt >= 3) {
          if (network) throw new ApiError('Can’t reach the server. Check your connection and try again.')
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : attempt === 1 ? 1_200 : 3_000))
      }
    }
  })()

  if (cacheable && ttl > 0) inflight.set(url, request)
  try {
    const value = await request
    if (cacheable && ttl > 0) cache.set(url, { value, expires: Date.now() + ttl })
    if (!cacheable) { lastMutationAt = Date.now(); cache.clear() }
    return value
  } finally {
    inflight.delete(url)
  }
}

export const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`
export const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Shrinks a photo to a small JPEG data URL so it can be stored with the guard record. */
export function photoToDataUrl(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file)
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')) }
    image.src = url
  })
}
