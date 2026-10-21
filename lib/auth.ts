import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { db } from '@/lib/db'
import { accounts, authSessions, invitations, members, organizations, users, verifications } from '@/lib/db/schema'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const trimSlash = (origin: string) => origin.replace(/\/+$/, '')
const defaultOrigin = trimSlash(process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))

/** Extra origins (e.g. the LAN address phones use for NFC) can be added as a comma-separated list. */
const configuredOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',').map((origin) => trimSlash(origin.trim())).filter(Boolean)

/** Local preview ports, so the app can be opened from localhost or 127.0.0.1 on any of them. */
const localOrigins = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:3100', 'http://127.0.0.1:3100',
  'https://localhost:3000', 'https://127.0.0.1:3000',
]

const trustedOrigins = [...new Set([
  defaultOrigin,
  ...configuredOrigins,
  ...localOrigins,
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
  ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
  ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
  ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
  ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
])]

export const auth = betterAuth({
  ...(hasDatabase ? {
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: authSessions,
        account: accounts,
        verification: verifications,
        organization: organizations,
        member: members,
        invitation: invitations,
      },
    }),
  } : {}),
  baseURL: defaultOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [organization({ allowUserToCreateOrganization: async () => true })],
  trustedOrigins,
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development' ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
