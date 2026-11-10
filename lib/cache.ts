type Entry = { value: unknown; expires: number }

/**
 * Small in-process cache for hot, organisation-scoped reads. Serverless instances each keep their
 * own copy, so entries are short-lived and safe to rebuild; the point is to keep the common
 * request path off the network (Supabase round-trips are ~200 ms each).
 */
const values = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
const responses = new Map<string, { body: string; status: number; expires: number }>()

const MAX_ENTRIES = 2_000

function prune() {
  const now = Date.now()
  for (const [key, entry] of values) if (entry.expires <= now) values.delete(key)
  for (const [key, entry] of responses) if (entry.expires <= now) responses.delete(key)
  while (values.size > MAX_ENTRIES) values.delete(values.keys().next().value as string)
  while (responses.size > MAX_ENTRIES) responses.delete(responses.keys().next().value as string)
}

/** Memoises a value for `ttlMs`, sharing one in-flight load between concurrent callers. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = values.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as T
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const promise = load()
    .then((value) => {
      values.set(key, { value, expires: Date.now() + ttlMs })
      if (values.size > MAX_ENTRIES) prune()
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/** Caches a JSON route response. The body is replayed for hits; misses return the original Response. */
export async function cachedJsonResponse(key: string, ttlMs: number, build: () => Promise<Response>): Promise<Response> {
  const hit = responses.get(key)
  if (hit && hit.expires > Date.now()) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': `private, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=30`,
        'x-cache': 'HIT',
      },
    })
  }
  const response = await build()
  if (response.ok) {
    const body = await response.clone().text()
    responses.set(key, { body, status: response.status, expires: Date.now() + ttlMs })
    if (responses.size > MAX_ENTRIES) prune()
    response.headers.set('x-cache', 'MISS')
    response.headers.set('cache-control', `private, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=30`)
  }
  return response
}

/** Drops every cache entry whose key starts with `prefix`. Call after a mutation. */
export function invalidate(prefix: string) {
  for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key)
  for (const key of responses.keys()) if (key.startsWith(prefix)) responses.delete(key)
}
