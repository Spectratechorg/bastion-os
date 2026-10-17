import { db, pool } from '../lib/db'
import { attendance, guards, incidents, organizations, patrols, sites } from '../lib/db/schema'

const userId = process.env.SEED_USER_ID
if (!userId) throw new Error('Set SEED_USER_ID to an existing Better Auth administrator before seeding.')

const now = new Date()
const siteNames = ['Eko Atlantic Tower', 'Meridian Mall', 'Chevron Estate', 'Zenith Court', 'Lekki Gardens', 'Ikeja Tech Park']
const guardNames = ['Musa Adamu', 'Chinedu Okafor', 'Aisha Bello', 'Ibrahim Lawal', 'Blessing Eze', 'Oluwaseun Adeyemi', 'Tobi James', 'Sade Oluwole', 'Peter Udo', 'Bola Ahmed', 'Emeka Okafor', 'Amaka Obi']

async function seed() {
  const [organization] = await db.insert(organizations).values({ name: 'Bastion Guards Ltd.', slug: `bastion-${Date.now()}`, createdAt: now }).returning()
  const siteRows = await db.insert(sites).values(siteNames.map((name, index) => ({ userId, organizationId: organization.id, name, address: `${index + 1} Lagos, Nigeria`, latitude: 6.45 + index / 100, longitude: 3.38 + index / 100, geofenceRadius: 100, dangerLevel: index === 1 ? 'high' : index === 3 ? 'medium' : 'low', status: 'active', createdAt: now }))).returning()
  const guardRows = await db.insert(guards).values(guardNames.map((name, index) => ({ userId, organizationId: organization.id, name, nin: `NIN-${String(index + 1).padStart(6, '0')}`, phone: `0803000${String(index).padStart(4, '0')}`, initials: name.split(' ').map((part) => part[0]).join(''), status: 'active', site: siteRows[index % siteRows.length].name, nfcToken: `BOS-DEMO-${index + 1}`, createdAt: now }))).returning()
  const records = Array.from({ length: 30 }, (_, day) => guardRows.map((guard, index) => ({ userId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, checkedInAt: new Date(now.getTime() - day * 86400000), latitude: 6.45, longitude: 3.38, method: 'nfc', withinGeofence: index % 9 !== 0, reviewStatus: index % 9 === 0 ? 'flagged' : 'approved', createdAt: now }))).flat()
  await db.insert(attendance).values(records)
  await db.insert(patrols).values(guardRows.map((guard, index) => ({ userId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, loggedAt: now, latitude: 6.45, longitude: 3.38, method: 'nfc', withinBounds: true, routeName: `Route ${String.fromCharCode(65 + (index % 3))}`, checkpoint: `Checkpoint ${index + 1}`, progress: 100, createdAt: now })))
  await db.insert(incidents).values([{ userId, organizationId: organization.id, title: 'Access review required', description: 'Seeded incident for workflow verification.', severity: 'medium', status: 'open', site: siteRows[0].name, comments: [], timeline: [`${now.toISOString()} Seeded`], reportedAt: now, createdAt: now }])
  console.log(`Seeded ${organization.name}. Add ${userId} as an organization owner in Better Auth before signing in.`)
}

seed().finally(() => pool.end())
