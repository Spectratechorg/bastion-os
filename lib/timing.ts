import { after } from 'next/server'

import { recordServerSample } from '@/lib/telemetry'
import { REPLAY_HEADER, REPLAY_RUN_PATTERN } from '@/lib/telemetry-shared'

/**
 * Wraps a route handler and records how long it took. The returned function keeps the handler's
 * exact parameter list, so Next's route-handler signature checks still see the original shape.
 *
 * The sample is scheduled with `after()` so it survives a serverless response being flushed;
 * the write still happens outside the response's critical path and can never fail the request.
 *
 * Requests carrying the dark-launch header are not recorded at all: a replay must not add its own
 * load to the numbers it is being compared against.
 */
export function timed<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const started = performance.now()
    const request = args[0]
    const replayHeader = request instanceof Request ? request.headers.get(REPLAY_HEADER) : null
    const isReplay = Boolean(replayHeader && REPLAY_RUN_PATTERN.test(replayHeader))

    const record = (status: number) => {
      if (isReplay) return
      const durationMs = performance.now() - started
      try {
        after(() => recordServerSample(route, durationMs, status))
      } catch {
        // Not inside a request scope (scripts, tests): record without the scheduler.
        recordServerSample(route, durationMs, status)
      }
    }

    try {
      const response = await handler(...args)
      record(response.status)
      return response
    } catch (error) {
      record(500)
      throw error
    }
  }
}
