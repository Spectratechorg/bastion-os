import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  activityEvents, alerts, attendance, clients, contracts, finances, guards, incidents,
  inventoryItems, members, organizations, patrolCheckpoints, patrols, sites, staff,
} from '../lib/db/schema'
import { eq } from 'drizzle-orm'

/** Unpooled connection: a one-off bulk write is more reliable direct to the branch. */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, max: 2 })
const db = drizzle(pool)

/**
 * Demo data for the workspace you are signed into.
 *
 *   pnpm db:seed                                  # uses your only Better Auth user
 *   SEED_EMAIL=you@company.com pnpm db:seed
 *   SEED_USER_ID=<user id> pnpm db:seed
 *
 * The seed fills the organization that user already belongs to, so the records show up in the
 * app straight away. It refuses to run twice on the same organization.
 */
const now = new Date()
const siteNames = ['Eko Atlantic Tower', 'Meridian Mall', 'Chevron Estate', 'Zenith Court', 'Lekki Gardens', 'Ikeja Tech Park']
const guardNames = ['Musa Adamu', 'Chinedu Okafor', 'Aisha Bello', 'Ibrahim Lawal', 'Blessing Eze', 'Oluwaseun Adeyemi', 'Tobi James', 'Sade Oluwole', 'Peter Udo', 'Bola Ahmed', 'Emeka Okafor', 'Amaka Obi']
const siteCoordinates = [[6.4599, 3.4241], [6.4347, 3.5071], [6.4437, 3.5276], [6.4912, 3.3844], [6.4698, 3.5852], [6.6018, 3.3515]] as const

async function resolveAdmin() {
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID
  if (process.env.SEED_EMAIL) {
    const found = await pool.query<{ id: string }>('select id from "user" where email = $1', [process.env.SEED_EMAIL])
    if (!found.rows[0]) throw new Error(`No user with email ${process.env.SEED_EMAIL}.`)
    return found.rows[0].id
  }
  const all = await pool.query<{ id: string }>('select id from "user"')
  if (all.rows.length === 1) return all.rows[0].id
  throw new Error('Set SEED_EMAIL to the account that should own this demo data (or SEED_USER_ID).')
}

async function resolveOrganization(userId: string) {
  const existing = await db.select({ organizationId: members.organizationId }).from(members).where(eq(members.userId, userId))
  if (existing.length > 0) return { id: existing[0].organizationId, created: false }
  const [organization] = await db.insert(organizations).values({ id: crypto.randomUUID(), name: 'Bastion Guards Ltd.', slug: `bastion-${Date.now()}`, createdAt: now }).returning()
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId: organization.id, userId: adminUserId, role: 'owner', createdAt: now })
  const siteRows = await db.insert(sites).values(siteNames.map((name, index) => ({ userId: adminUserId, organizationId: organization.id, name, address: `${index + 1} Lagos, Nigeria`, latitude: siteCoordinates[index][0], longitude: siteCoordinates[index][1], geofenceRadius: 100, dangerLevel: index === 1 ? 'high' : index === 3 ? 'medium' : 'low', status: 'active', createdAt: now }))).returning()
  const guardRows = await db.insert(guards).values(guardNames.map((name, index) => ({ userId: adminUserId, organizationId: organization.id, name, nin: `NIN-${String(index + 1).padStart(6, '0')}`, phone: `0803000${String(index).padStart(4, '0')}`, initials: name.split(' ').map((part) => part[0]).join(''), status: 'active', site: siteRows[index % siteRows.length].name, nfcToken: `BOS-DEMO-${index + 1}`, createdAt: now }))).returning()
  const records = Array.from({ length: 30 }, (_, day) => guardRows.map((guard, index) => ({ userId: adminUserId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, checkedInAt: new Date(now.getTime() - day * 86400000), latitude: siteRows[index % siteRows.length].latitude, longitude: siteRows[index % siteRows.length].longitude, method: 'nfc', withinGeofence: true, reviewStatus: index % 9 === 0 ? 'flagged' : 'approved', createdAt: now }))).flat()
  await db.insert(attendance).values(records)
  await db.insert(patrols).values(guardRows.map((guard, index) => ({ userId: adminUserId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, loggedAt: now, latitude: siteRows[index % siteRows.length].latitude, longitude: siteRows[index % siteRows.length].longitude, method: 'nfc', withinBounds: true, routeName: `Route ${String.fromCharCode(65 + (index % 3))}`, checkpoint: `Checkpoint ${index + 1}`, progress: 100, createdAt: now })))
  await db.insert(incidents).values([{ userId: adminUserId, organizationId: organization.id, title: 'Access review required', description: 'Seeded incident for workflow verification.', severity: 'medium', status: 'open', site: siteRows[0].name, comments: [], timeline: [`${now.toISOString()} Seeded`], reportedAt: now, createdAt: now }])
  console.log(`Seeded ${organization.name} and assigned ${adminUserId} as its owner.`)
}

seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => pool.end())
