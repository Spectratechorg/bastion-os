import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { pool } from '@/lib/db'

const hasDatabase = Boolean(process.env.DATABASE_URL)
const defaultOrigin = process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.V0_RUNTIME_URL ?? 'http://localhost:3000')

export const auth = betterAuth({
  ...(hasDatabase ? { database: pool } : {}),
  baseURL: defaultOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  rateLimit: { enabled: true, window: 60, max: 60, customRules: { '/sign-in/email': { window: 60, max: 8 }, '/sign-up/email': { window: 60, max: 5 } } },
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [organization({ allowUserToCreateOrganization: async () => true })],
  databaseHooks: {
    session: {
      create: {
        // Every new sign-in starts inside the user's first organization, so the API never has to ask them to pick one.
        before: async (session) => {
          const result = await pool.query('select "organizationId" from member where "userId" = $1 order by "createdAt" asc limit 1', [session.userId]).catch(() => ({ rows: [] as { organizationId: string }[] }))
          return { data: { ...session, activeOrganizationId: result.rows[0]?.organizationId ?? null } }
        },
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []), ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []), ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []), ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : [])] : []),
    ...(process.env.NODE_ENV === 'production' ? [...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []), ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : [])] : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // UUID ids so Better Auth organization ids fit the uuid organization_id columns used by every BastionOS table.
  advanced: {
    database: { generateId: 'uuid' as const },
    ...(process.env.NODE_ENV === 'development' ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } : {}),
  },
})
