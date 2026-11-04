import { AsyncLocalStorage } from 'node:async_hooks'

/** The actor resolved for the current request, cached so wrappers and handlers do one lookup. */
export type RequestActor = { userId: string; organizationId: string; role: string }

export const actorScope = new AsyncLocalStorage<RequestActor>()
