import { after } from 'next/server'

import { recordServerSample } from '@/lib/telemetry'

/**
 * Wraps a route handler and records how long it took. The returned function keeps the handler's
 * exact parameter list, so Next's route-handler signature checks still see the original shape.
 *
 * The sample is scheduled with `after()` so it survives a serverless response being flushed;
 * the write still happens outside the response's critical path and can never fail the request.
 */
export function timed<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const started = performance.now()
    let status = 500
    try {
      const response = await handler(...args)
      status = response.status
      return response
    } finally {
      const durationMs = performance.now() - started
      try {
        after(() => recordServerSample(route, durationMs, status))
      } catch {
        // Not inside a request scope (scripts, tests): record without the scheduler.
        recordServerSample(route, durationMs, status)
      }
    }
  }
}
