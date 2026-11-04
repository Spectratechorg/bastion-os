import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Self-service sign-up is only for the very first account (bootstrap). Every other account is
 * provisioned by an owner/administrator from Settings → Team, which executes in this context so
 * the auth hook allows it through.
 */
export const provisioningSignup = new AsyncLocalStorage<boolean>()
