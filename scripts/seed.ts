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
const day = (offset: number, hour = 8) => new Date(new Date(now.getTime() - offset * 86400000).setHours(hour, 0, 0, 0))
const dateKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
const shiftStart = 8
const slotCount = 10

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
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId: organization.id, userId, role: 'owner', createdAt: now })
  return { id: organization.id, created: true }
}

const siteSpecs = [
  { name: 'Eko Atlantic Tower', address: '12 Ahmadu Bello Way, Victoria Island, Lagos', latitude: 6.4281, longitude: 3.4219, client: 0 },
  { name: 'Meridian Mall', address: '7 Ozumba Mbadiwe Ave, Victoria Island, Lagos', latitude: 6.4304, longitude: 3.4186, client: 0 },
  { name: 'Chevron Estate Gate 3', address: 'Chevron Drive, Lekki, Lagos', latitude: 6.4402, longitude: 3.4952, client: 1 },
  { name: 'Zenith Court', address: '4 Adeola Odeku St, Victoria Island, Lagos', latitude: 6.4265, longitude: 3.4157, client: 1 },
  { name: 'Lekki Gardens Phase 2', address: 'Lekki Gardens, Ajah, Lagos', latitude: 6.4672, longitude: 3.5641, client: 1 },
  { name: 'Ikeja Tech Park', address: '23 Obafemi Awolowo Way, Ikeja, Lagos', latitude: 6.6018, longitude: 3.3515, client: 0 },
]

const guardSpecs: [string, number][] = [
  ['Musa Adamu', 180000], ['Chinedu Okafor', 165000], ['Aisha Bello', 175000], ['Ibrahim Lawal', 160000],
  ['Blessing Eze', 185000], ['Oluwaseun Adeyemi', 170000], ['Tobi James', 155000], ['Sade Oluwole', 190000],
  ['Peter Udo', 160000], ['Bola Ahmed', 175000], ['Emeka Okafor', 180000], ['Amaka Obi', 165000],
]

async function seed() {
  const adminUserId = await resolveAdmin()
  const organization = await resolveOrganization(adminUserId)
  const organizationId = organization.id

  const existing = await db.select({ id: guards.id }).from(guards).where(eq(guards.organizationId, organizationId)).limit(1)
  if (existing.length > 0) {
    console.log(`Organization ${organizationId} already has guards, so nothing was seeded.`)
    return
  }

  const clientRows = await db.insert(clients).values([
    { userId: adminUserId, organizationId, name: 'Eko Atlantic Facilities', contactName: 'Ada Obi', email: 'ada@ekoatlantic.example', phone: '0803 000 1100', status: 'active', monthlyValue: 2400000, slaScore: 96, renewalDate: day(-40), createdAt: now },
    { userId: adminUserId, organizationId, name: 'Lekki Residences Ltd.', contactName: 'Femi Ade', email: 'femi@lekki.example', phone: '0803 000 2200', status: 'active', monthlyValue: 1850000, slaScore: 91, renewalDate: day(-70), createdAt: now },
  ]).returning()

  const siteRows = await db.insert(sites).values(siteSpecs.map((site, index) => ({
    userId: adminUserId, organizationId, name: site.name, address: site.address, latitude: site.latitude, longitude: site.longitude,
    geofenceRadius: 150, status: 'active', dangerLevel: index === 1 ? 'high' : index === 3 ? 'medium' : 'low',
    clientId: clientRows[site.client].id, createdAt: now,
  }))).returning()

  const guardRows = await db.insert(guards).values(guardSpecs.map(([name, salary], index) => ({
    userId: adminUserId, organizationId, name, nin: `NIN-${100000 + index}`, phone: `0803${String(1000000 + index * 7).slice(0, 7)}`,
    initials: name.split(' ').map((part) => part[0]).join(''), status: index === 11 ? 'suspended' : 'active',
    site: siteRows[index % siteRows.length].name, monthlySalary: salary, nfcToken: `BOS-DEMO-${String(index + 1).padStart(3, '0')}`, createdAt: now,
  }))).returning()

  const checkIns = Array.from({ length: 30 }, (_, offset) => guardRows.slice(0, 11).map((guard, index) => {
    const at = day(offset, 7 + (index % 2))
    return {
      userId: adminUserId, organizationId, guardId: guard.id, siteId: siteRows[index % siteRows.length].id,
      checkedInAt: at, checkedOutAt: new Date(at.getTime() + 10 * 3600000), latitude: 6.43, longitude: 3.42, method: 'nfc',
      withinGeofence: (offset + index) % 10 !== 0, reviewStatus: (offset + index) % 10 === 0 ? 'flagged' : 'approved', createdAt: at,
    }
  })).flat()
  for (let index = 0; index < checkIns.length; index += 60) {
    await db.insert(attendance).values(checkIns.slice(index, index + 60))
  }

  const slots = Array.from({ length: slotCount }, (_, index) => `${String(shiftStart + index).padStart(2, '0')}:00`)
  for (const offset of [4, 3, 2, 1, 0]) {
    for (const [index, guard] of guardRows.slice(0, 11).entries()) {
      if (guard.status !== 'active') continue
      const signed = offset === 0 ? 3 + (index % 2) : slotCount
      const [patrol] = await db.insert(patrols).values({
        userId: adminUserId, organizationId, guardId: guard.id, siteId: siteRows[index % siteRows.length].id,
        loggedAt: day(offset), patrolDate: dateKey(day(offset)), latitude: 6.43, longitude: 3.42, method: 'nfc', withinBounds: true,
        routeName: `Route ${String.fromCharCode(65 + (index % 3))}`, checkpoint: 'Main gate',
        progress: Math.round((signed / slotCount) * 100), status: signed >= slotCount ? 'completed' : 'in_progress', createdAt: day(offset),
      }).returning()
      await db.insert(patrolCheckpoints).values(slots.slice(0, signed).map((slot, position) => ({
        userId: adminUserId, organizationId, patrolId: patrol.id, slot, signedAt: day(offset, shiftStart + position),
      })))
    }
  }

  await db.insert(incidents).values([
    { userId: adminUserId, organizationId, title: 'Attempted break-in at the rear gate', description: 'Two men tried to force the rear gate open around 02:10. The guard raised the alarm and they fled.', severity: 'critical', status: 'open', site: siteRows[1].name, assigneeId: guardRows[0].id, comments: [], timeline: [`${day(1).toISOString()} Reported by ${guardRows[0].name}`], reportedAt: day(1, 2), createdAt: day(1, 2) },
    { userId: adminUserId, organizationId, title: 'Floodlight failure on the east side', description: 'Floodlight stopped working after the storm. Electrician booked.', severity: 'medium', status: 'resolved', site: siteRows[2].name, comments: [], timeline: [`${day(6).toISOString()} Reported`, `${day(5).toISOString()} Marked resolved`], reportedAt: day(6, 19), createdAt: day(6, 19) },
    { userId: adminUserId, organizationId, title: 'Unauthorised vehicle at loading bay', description: 'Vehicle without a pass parked at the loading bay for 40 minutes.', severity: 'low', status: 'open', site: siteRows[0].name, comments: [], timeline: [`${day(0, 6).toISOString()} Reported`], reportedAt: day(0, 6), createdAt: day(0, 6) },
  ])

  await db.insert(alerts).values([
    { userId: adminUserId, organizationId, type: 'sos', title: 'SOS activated', body: `${guardRows[2].name} at ${siteRows[2].name} needs help.`, severity: 'critical', acknowledged: false, dedupeKey: `seed:sos:${now.getTime()}`, createdAt: new Date(now.getTime() - 3600000) },
    { userId: adminUserId, organizationId, type: 'geofence', title: `Geofence breach: ${guardRows[3].name}`, body: `${siteRows[3].name} · scanned outside the 150 m radius`, severity: 'high', acknowledged: false, dedupeKey: `seed:geo:${now.getTime()}`, createdAt: new Date(now.getTime() - 5 * 3600000) },
    { userId: adminUserId, organizationId, type: 'patrol', title: 'Missed patrol', body: `${guardRows[4].name} did not complete all checkpoints at ${siteRows[4].name}`, severity: 'medium', acknowledged: true, dedupeKey: `seed:patrol:${now.getTime()}`, createdAt: new Date(now.getTime() - 2 * 86400000) },
  ])

  await db.insert(finances).values([
    { userId: adminUserId, organizationId, kind: 'income', label: 'Eko Atlantic guarding retainer', amount: 2400000, status: 'paid', dueDate: day(10), clientId: clientRows[0].id, siteId: siteRows[0].id, category: 'retainer', notes: 'October retainer', createdAt: day(12) },
    { userId: adminUserId, organizationId, kind: 'income', label: 'Lekki Residences guarding retainer', amount: 1850000, status: 'pending', dueDate: day(-5), clientId: clientRows[1].id, siteId: siteRows[2].id, category: 'retainer', notes: 'November retainer', createdAt: day(3) },
    { userId: adminUserId, organizationId, kind: 'expense', label: 'Radio batteries and chargers', amount: 38000, status: 'pending', dueDate: day(-3), category: 'equipment', notes: '12 handsets', createdAt: day(2) },
    { userId: adminUserId, organizationId, kind: 'expense', label: 'October fuel and transport', amount: 220000, status: 'paid', dueDate: day(8), category: 'logistics', createdAt: day(9) },
  ])

  await db.insert(staff).values([
    { userId: adminUserId, organizationId, name: 'Grace Nwosu', title: 'Operations manager', phone: '0803 111 2222', monthlySalary: 420000, startDate: '2024-02-01', status: 'active', createdAt: now },
    { userId: adminUserId, organizationId, name: 'Samuel Adeyinka', title: 'Control room supervisor', phone: '0803 333 4444', monthlySalary: 310000, startDate: '2024-06-15', status: 'active', createdAt: now },
  ])

  await db.insert(inventoryItems).values([
    { userId: adminUserId, organizationId, name: 'NFC patrol tags', category: 'Equipment', quantity: 48, minQuantity: 20, location: 'Ikeja store', unitCost: 2500, createdAt: now },
    { userId: adminUserId, organizationId, name: 'Guard uniforms (set)', category: 'Uniform', quantity: 34, minQuantity: 15, location: 'Ikeja store', unitCost: 12000, createdAt: now },
    { userId: adminUserId, organizationId, name: 'Two-way radios', category: 'Equipment', quantity: 9, minQuantity: 12, location: 'Control room', unitCost: 45000, notes: 'Below minimum — order more', createdAt: now },
  ])

  await db.insert(contracts).values([
    { userId: adminUserId, organizationId, clientName: clientRows[0].name, title: 'Manned guarding — Lagos Island portfolio', sites: siteSpecs.filter((s) => s.client === 0).map((s) => s.name).join(', '), monthlyFee: 2400000, startDate: '2025-01-01', endDate: '2026-12-31', nextDueDate: dateKey(day(-5)), paymentStatus: 'pending', createdAt: now },
    { userId: adminUserId, organizationId, clientName: clientRows[1].name, title: 'Manned guarding — Lekki portfolio', sites: siteSpecs.filter((s) => s.client === 1).map((s) => s.name).join(', '), monthlyFee: 1850000, startDate: '2025-03-01', endDate: '2026-08-31', nextDueDate: dateKey(day(-20)), paymentStatus: 'paid', createdAt: now },
  ])

  await db.insert(activityEvents).values([
    { userId: adminUserId, organizationId, type: 'site', title: 'Meridian Mall flagged high risk', body: 'Calculated from a critical incident in the last 30 days.', tone: 'warning', createdAt: day(1) },
    { userId: adminUserId, organizationId, type: 'guard', title: 'Guards checked in across all sites', body: 'Morning shift coverage recorded.', tone: 'success', createdAt: day(0, 8) },
    { userId: adminUserId, organizationId, type: 'finance', title: 'Retainer marked paid', body: 'Eko Atlantic Facilities · ₦2,400,000', tone: 'success', createdAt: day(10) },
  ])

  console.log(`Seeded ${siteRows.length} sites, ${guardRows.length} guards, ${checkIns.length} check-ins and 5 days of patrols into organization ${organizationId}${organization.created ? ' (new)' : ''}.`)
  console.log('Reload the app — the demo data is already in your workspace.')
}

seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => pool.end())
