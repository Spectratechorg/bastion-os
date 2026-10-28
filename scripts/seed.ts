import { db, pool } from '../lib/db'
import { activityEvents, alerts, attendance, clients, finances, guards, incidents, members, organizations, patrols, sites } from '../lib/db/schema'

const userId = process.env.SEED_USER_ID
if (!userId) throw new Error('Set SEED_USER_ID to an existing Better Auth administrator before seeding.')
const adminUserId: string = userId

const now = new Date()
const siteNames = ['Eko Atlantic Tower', 'Meridian Mall', 'Chevron Estate', 'Zenith Court', 'Lekki Gardens', 'Ikeja Tech Park']
const guardNames = ['Musa Adamu', 'Chinedu Okafor', 'Aisha Bello', 'Ibrahim Lawal', 'Blessing Eze', 'Oluwaseun Adeyemi', 'Tobi James', 'Sade Oluwole', 'Peter Udo', 'Bola Ahmed', 'Emeka Okafor', 'Amaka Obi']
const siteCoordinates = [[6.4599, 3.4241], [6.4347, 3.5071], [6.4437, 3.5276], [6.4912, 3.3844], [6.4698, 3.5852], [6.6018, 3.3515]] as const

async function seed() {
  const [organization] = await db.insert(organizations).values({ id: crypto.randomUUID(), name: 'Bastion Guards Ltd.', slug: `bastion-${Date.now()}`, createdAt: now }).returning()
  await db.insert(members).values({ id: crypto.randomUUID(), organizationId: organization.id, userId: adminUserId, role: 'owner', createdAt: now })
  const clientRows = await db.insert(clients).values([
    { userId: adminUserId, organizationId: organization.id, name: 'Meridian Property Group', contactName: 'Tunde Adebayo', email: 'tunde@meridian.example', phone: '+234 801 555 0101', status: 'active', monthlyValue: 2850000, slaScore: 98, renewalDate: new Date(now.getTime() + 180 * 86400000), createdAt: now },
    { userId: adminUserId, organizationId: organization.id, name: 'Eko Retail Partners', contactName: 'Nneka Obi', email: 'nneka@eko.example', phone: '+234 801 555 0102', status: 'active', monthlyValue: 1925000, slaScore: 95, renewalDate: new Date(now.getTime() + 90 * 86400000), createdAt: now },
    { userId: adminUserId, organizationId: organization.id, name: 'Northstar Estates', contactName: 'Femi Balogun', email: 'femi@northstar.example', phone: '+234 801 555 0103', status: 'active', monthlyValue: 1475000, slaScore: 92, renewalDate: new Date(now.getTime() + 240 * 86400000), createdAt: now },
  ]).returning()
  const siteRows = await db.insert(sites).values(siteNames.map((name, index) => ({ userId: adminUserId, organizationId: organization.id, name, address: `${index + 1} Lagos, Nigeria`, latitude: siteCoordinates[index][0], longitude: siteCoordinates[index][1], geofenceRadius: 100, clientId: clientRows[index % clientRows.length].id, dangerLevel: index === 1 ? 'high' : index === 3 ? 'medium' : 'low', status: 'active', createdAt: now }))).returning()
  const guardRows = await db.insert(guards).values(guardNames.map((name, index) => ({ userId: adminUserId, organizationId: organization.id, name, nin: `NIN-${String(index + 1).padStart(6, '0')}`, phone: `0803000${String(index).padStart(4, '0')}`, initials: name.split(' ').map((part) => part[0]).join(''), status: 'active', site: siteRows[index % siteRows.length].name, nfcToken: `BOS-DEMO-${index + 1}`, monthlySalary: 180000 + (index % 4) * 25000, lastCheckIn: new Date(now.getTime() - (index + 1) * 7 * 60000), lastLatitude: siteRows[index % siteRows.length].latitude, lastLongitude: siteRows[index % siteRows.length].longitude, createdAt: now }))).returning()
  const records = Array.from({ length: 30 }, (_, day) => guardRows.map((guard, index) => ({ userId: adminUserId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, checkedInAt: new Date(now.getTime() - day * 86400000), latitude: siteRows[index % siteRows.length].latitude, longitude: siteRows[index % siteRows.length].longitude, method: 'nfc', withinGeofence: true, reviewStatus: index % 9 === 0 ? 'flagged' : 'approved', createdAt: now }))).flat()
  await db.insert(attendance).values(records)
  await db.insert(patrols).values(guardRows.map((guard, index) => ({ userId: adminUserId, organizationId: organization.id, guardId: guard.id, siteId: siteRows[index % siteRows.length].id, loggedAt: now, latitude: siteRows[index % siteRows.length].latitude, longitude: siteRows[index % siteRows.length].longitude, method: 'nfc', withinBounds: true, routeName: `Route ${String.fromCharCode(65 + (index % 3))}`, checkpoint: `Checkpoint ${index + 1}`, progress: 100, createdAt: now })))
  await db.insert(incidents).values([
    { userId: adminUserId, organizationId: organization.id, title: 'Access review required', description: 'Visitor access badge needs verification at the main entrance.', severity: 'medium', status: 'open', site: siteRows[0].name, comments: [], timeline: [`${now.toISOString()} Seeded`], reportedAt: now, createdAt: now },
    { userId: adminUserId, organizationId: organization.id, title: 'Perimeter light outage', description: 'North perimeter lighting is scheduled for maintenance.', severity: 'low', status: 'resolved', site: siteRows[2].name, comments: ['Maintenance team notified'], timeline: [`${now.toISOString()} Resolved`], reportedAt: new Date(now.getTime() - 86400000), createdAt: now },
  ])
  await db.insert(finances).values([
    { userId: adminUserId, organizationId: organization.id, kind: 'revenue', label: 'Meridian Property Group — Q4 contract', amount: 2850000, status: 'paid', dueDate: new Date(now.getTime() + 30 * 86400000), notes: 'Quarterly security coverage', clientId: clientRows[0].id, siteId: siteRows[0].id, category: 'Contracts', createdAt: now },
    { userId: adminUserId, organizationId: organization.id, kind: 'revenue', label: 'Eko Retail Partners — Q4 contract', amount: 1925000, status: 'pending', dueDate: new Date(now.getTime() + 14 * 86400000), notes: 'Retail coverage renewal', clientId: clientRows[1].id, siteId: siteRows[1].id, category: 'Contracts', createdAt: now },
    { userId: adminUserId, organizationId: organization.id, kind: 'expense', label: 'Guard equipment replenishment', amount: 348500, status: 'approved', dueDate: new Date(now.getTime() + 7 * 86400000), notes: 'Radios, reflective vests, and NFC tags', siteId: siteRows[3].id, category: 'Operations', createdAt: now },
  ])
  await db.insert(alerts).values([
    { userId: adminUserId, organizationId: organization.id, type: 'attendance', title: 'Late check-in detected', body: `${guardRows[3].name} checked in 18 minutes late at ${siteRows[1].name}.`, severity: 'medium', acknowledged: false, dedupeKey: `demo-late-${Date.now()}`, createdAt: now },
    { userId: adminUserId, organizationId: organization.id, type: 'patrol', title: 'Patrol checkpoint completed', body: `${guardRows[0].name} completed the north route.`, severity: 'low', acknowledged: true, dedupeKey: `demo-patrol-${Date.now()}`, createdAt: now },
  ])
  await db.insert(activityEvents).values([
    { userId: adminUserId, organizationId: organization.id, type: 'demo.seeded', title: 'Demo workspace prepared', body: 'Sample guards, sites, attendance, patrols, incidents, clients, and finance records were added.', tone: 'neutral', createdAt: now },
    { userId: adminUserId, organizationId: organization.id, type: 'guard.checkin', title: `${guardRows[0].name} checked in`, body: `NFC scan at ${siteRows[0].name}`, tone: 'positive', createdAt: new Date(now.getTime() - 12 * 60000) },
  ])
  console.log(`Seeded ${organization.name} and assigned ${adminUserId} as its owner.`)
}

seed().finally(() => pool.end())
