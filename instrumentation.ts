import { reportServerError } from '@/lib/observability'

export async function onRequestError(error: unknown, request: { path?: string; method?: string }, context: { routePath?: string; routerKind?: string; routeType?: string }) {
  reportServerError('request', error, { path: request?.path, method: request?.method, ...context })
}
