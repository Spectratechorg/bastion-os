import { actor } from '@/lib/server'
import { withTenant } from '@/lib/db'
import { actorScope } from '@/lib/request-context'

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response>

/**
 * Runs a route handler inside the active organization's tenant transaction.
 *
 * Postgres row-level security reads `app.organization_id` from that transaction, so handlers no
 * longer need `organization_id = ...` on every query. The resolved actor is cached for the handler,
 * which keeps `actor()` from making a second session lookup.
 *
 * A handler that cannot resolve an actor runs unscoped and is expected to answer 401 itself; RLS
 * then returns nothing rather than leaking another organization's rows.
 */
export function tenantScoped<Args extends unknown[]>(handler: Handler<Args>): Handler<Args> {
  return async (...args: Args): Promise<Response> => {
    const current = await actor()
    if (!current) return handler(...args)
    return withTenant(current.organizationId, () => actorScope.run(current, () => handler(...args)))
  }
}
