import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  activityEvents, alerts, attendance, clients, contracts, finances, guardLocations,
  guards, incidents, inventoryItems, members, organizations, patrolCheckpoints, patrols,
  payrollRecords, sites, staff,
} from '../lib/db/schema'
import { guardShift, patrolSlots } from '../lib/server-rules'

const rawUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || ''
const isLocal = /localhost|127\.0\.0\.1/.test(rawUrl)
const connectionString = isLocal ? rawUrl : rawUrl.replace(/[?&](sslmode|uselibpqcompat)=[^&]+/g, '').replace(/\?$/, '')
const pool = new pg.Pool({ connectionString, max: 2, ssl: isLocal ? false : { rejectUnauthorized: false } })
const db = drizzle(pool)
const now = new Date()
const pad = (value: number) => String(value).padStart(2, '0')
const lagosDate = (offset = 0) => new Date(now.getTime() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
const atLagos = (date: string, hour: number, minute = 0) => new Date(`${date}T${pad(hour)}:${pad(minute)}:00+01:00`)
const seed = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
const jitter = (value: number, spread = 0.0015) => value + (seed(Math.abs(value) * 1000 + 7) - 0.5) * spread
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
const currentHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hourCycle: 'h23' }).format(now))

async function resolveAdmin() {
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID
  const email = process.env.SEED_EMAIL || 'qa.tester@example.com'
  const found = await pool.query<{ id: string }>('select id from "user" where email = $1', [email])
  if (!found.rows[0]) throw new Error(`No user with email ${email}. Set SEED_EMAIL.`)
  return found.rows[0].id
}

async function resolveOrganization(userId: string) {
  const found = await pool.query<{ organization_id: string }>('select organization_id from member where user_id = $1 and role in (\'owner\',\'admin\') order by created_at limit 1', [userId])
  if (!found.rows[0]) throw new Error('This user has no organization.')
  return found.rows[0].organization_id
}

const clientSpecs = [
  ['Abuja Capital Facilities', 'Ngozi Okoro', 'ops@abujacapital.example', '0803 100 2101', 96000000, 94],
  ['Eko Atlantic Facilities', 'Ada Obi', 'ada@ekoatlantic.example', '0803 100 2102', 84000000, 96],
  ['Lekki Residences Ltd.', 'Femi Ade', 'femi@lekki.example', '0803 100 2103', 72000000, 91],
  ['Rivers Industrial Services', 'Ibiso Amadi', 'ops@riversindustrial.example', '0803 100 2104', 66000000, 89],
  ['Kano Commercial Group', 'Sani Bello', 'facilities@kanocommercial.example', '0803 100 2105', 54000000, 86],
  ['Oyo Estates', 'Bola Ogunleye', 'bola@oyoestates.example', '0803 100 2106', 48000000, 92],
  ['Enugu Retail Holdings', 'Chika Nwosu', 'chika@enuguretail.example', '0803 100 2107', 42000000, 88],
  ['Kaduna Logistics', 'Ahmed Sule', 'ops@kadunalogistics.example', '0803 100 2108', 45000000, 84],
  ['Plateau Markets', 'Danjuma Pam', 'danjuma@plateaumarkets.example', '0803 100 2109', 36000000, 87],
  ['Delta Property Group', 'Efe Okowa', 'efe@deltaproperty.example', '0803 100 2110', 39000000, 90],
  ['Ibom Facilities', 'Emem Udo', 'emem@ibomfacilities.example', '0803 100 2111', 33000000, 85],
  ['South-South Facilities', 'Rita Bassey', 'rita@southsouth.example', '0803 100 2112', 51000000, 93],
] as const

const siteSpecs = [
  { name: 'Transcorp Hilton Abuja', address: '1 Aguiyi Ironsi St, Maitama, Abuja', city: 'Abuja', state: 'FCT', latitude: 9.0789, longitude: 7.4951, client: 0, guards: 3 },
  { name: 'Jabi Lake Mall', address: 'Jabi Lake, Jabi, Abuja', city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.4237, client: 0, guards: 1 },
  { name: 'Wuse Market Complex', address: 'Wuse Market, Wuse, Abuja', city: 'Abuja', state: 'FCT', latitude: 9.0670, longitude: 7.4730, client: 0, guards: 3 },
  { name: 'Eko Atlantic Tower', address: '12 Ahmadu Bello Way, Victoria Island, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.4281, longitude: 3.4219, client: 1, guards: 2 },
  { name: 'Victoria Island Office Park', address: '4 Adeola Odeku St, Victoria Island, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.4265, longitude: 3.4157, client: 1, guards: 3 },
  { name: 'Lekki Phase 1 Estate', address: 'Lekki Phase 1, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.4470, longitude: 3.4720, client: 2, guards: 2 },
  { name: 'Ikoyi Residences', address: 'Glover Road, Ikoyi, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.4520, longitude: 3.4350, client: 2, guards: 1 },
  { name: 'Ikeja City Mall', address: 'Obafemi Awolowo Way, Ikeja, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.6018, longitude: 3.3515, client: 2, guards: 3 },
  { name: 'Apapa Port Gate', address: 'Wharf Road, Apapa, Lagos', city: 'Lagos', state: 'Lagos', latitude: 6.4470, longitude: 3.3590, client: 1, guards: 2 },
  { name: 'Trans Amadi Industrial Park', address: 'Trans Amadi, Port Harcourt, Rivers', city: 'Port Harcourt', state: 'Rivers', latitude: 4.7970, longitude: 7.0490, client: 3, guards: 2 },
  { name: 'Port Harcourt Mall', address: 'Aba Road, Port Harcourt, Rivers', city: 'Port Harcourt', state: 'Rivers', latitude: 4.8150, longitude: 7.0130, client: 3, guards: 3 },
  { name: 'Ado Bayero Mall', address: 'Zoo Road, Kano', city: 'Kano', state: 'Kano', latitude: 11.9980, longitude: 8.5160, client: 4, guards: 1 },
  { name: 'Kano Commercial Hub', address: 'Kantin Kwari, Kano', city: 'Kano', state: 'Kano', latitude: 12.0020, longitude: 8.5190, client: 4, guards: 2 },
  { name: 'Ibadan Palms', address: 'Ring Road, Ibadan, Oyo', city: 'Ibadan', state: 'Oyo', latitude: 7.3770, longitude: 3.9470, client: 5, guards: 4 },
  { name: 'Bodija Market', address: 'Bodija, Ibadan, Oyo', city: 'Ibadan', state: 'Oyo', latitude: 7.4060, longitude: 3.8990, client: 5, guards: 2 },
  { name: 'Polo Park Enugu', address: 'Abba Road, GRA, Enugu', city: 'Enugu', state: 'Enugu', latitude: 6.4410, longitude: 7.4980, client: 6, guards: 3 },
  { name: 'Independence Layout', address: 'Independence Layout, Enugu', city: 'Enugu', state: 'Enugu', latitude: 6.4490, longitude: 7.5100, client: 6, guards: 1 },
  { name: 'Barnawa Estate', address: 'Barnawa, Kaduna', city: 'Kaduna', state: 'Kaduna', latitude: 10.4920, longitude: 7.4370, client: 7, guards: 2 },
  { name: 'Kaduna Central Market', address: 'Central Market, Kaduna', city: 'Kaduna', state: 'Kaduna', latitude: 10.5230, longitude: 7.4380, client: 7, guards: 3 },
  { name: 'Jos Main Market', address: 'Terminus, Jos, Plateau', city: 'Jos', state: 'Plateau', latitude: 9.8960, longitude: 8.8580, client: 8, guards: 2 },
  { name: 'Asaba Mall', address: 'Okpanam Road, Asaba, Delta', city: 'Asaba', state: 'Delta', latitude: 6.1980, longitude: 6.6960, client: 9, guards: 1 },
  { name: 'Ibom Plaza', address: 'Ibom Plaza, Uyo, Akwa Ibom', city: 'Uyo', state: 'Akwa Ibom', latitude: 5.0370, longitude: 7.9120, client: 10, guards: 1 },
  { name: 'Benin City Mall', address: 'Sapele Road, Benin City, Edo', city: 'Benin City', state: 'Edo', latitude: 6.3350, longitude: 5.6240, client: 11, guards: 2 },
  { name: 'Owerri Mall', address: 'Okigwe Road, Owerri, Imo', city: 'Owerri', state: 'Imo', latitude: 5.4840, longitude: 7.0330, client: 11, guards: 1 },
]

const guardNames = [
  'Musa Adamu', 'Chinedu Okafor', 'Aisha Bello', 'Ibrahim Lawal', 'Blessing Eze', 'Oluwaseun Adeyemi', 'Tobi James', 'Sade Oluwole', 'Peter Udo', 'Bola Ahmed',
  'Emeka Okafor', 'Amaka Obi', 'Sani Abubakar', 'Fatima Yusuf', 'Kelechi Nwosu', 'Tunde Bakare', 'Ngozi Eze', 'Yakubu Danjuma', 'Funmi Adebayo', 'Ali Modu',
  'Chioma Nnamdi', 'Segun Ojo', 'Halima Bello', 'Ifeanyi Obi', 'Yemi Adeleke', 'Zainab Musa', 'Kunle Adebayo', 'Adaeze Okonkwo', 'Bashir Sani', 'Grace Nwosu',
  'Femi Ogunleye', 'Hauwa Ibrahim', 'Chidi Umeh', 'Kemi Balogun', 'Nasiru Garba', 'Ebere Okafor', 'Sola Akinola', 'Maryam Sule', 'Uche Nwankwo', 'Bisi Adeyemi',
  'Ahmed Lawan', 'Nkem Eze', 'Wale Ogun', 'Hadiza Bello', 'Daniel Etim', 'Precious Okon', 'Idris Mohammed', 'Chinwe Eze', 'Segun Adeleke', 'Rita Bassey',
]

const shiftPresets = [
  { shiftStartHour: null, shiftEndHour: null },
  { shiftStartHour: 6, shiftEndHour: 14 },
  { shiftStartHour: 8, shiftEndHour: 18 },
  { shiftStartHour: 14, shiftEndHour: 22 },
  { shiftStartHour: 20, shiftEndHour: 8 },
  { shiftStartHour: 8, shiftEndHour: 16 },
]

async function clearDemo(organizationId: string) {
  await pool.query('begin')
  try {
    for (const table of ['patrol_checkpoints', 'patrols', 'attendance', 'guard_locations', 'payroll_records', 'alerts', 'activity_events', 'finances', 'contracts', 'inventory_items', 'staff', 'incidents', 'guards', 'sites', 'clients']) {
      await pool.query(`delete from "${table}" where organization_id = $1`, [organizationId])
    }
    await pool.query('commit')
  } catch (error) { await pool.query('rollback'); throw error }
}

async function main() {
  const userId = await resolveAdmin()
  const organizationId = await resolveOrganization(userId)
  await clearDemo(organizationId)
  await db.update(organizations).set({ patrolStartHour: 8, patrolEndHour: 18 }).where(eq(organizations.id, organizationId))

  const clientRows = await db.insert(clients).values(clientSpecs.map((spec, index) => ({
    userId, organizationId, name: spec[0], contactName: spec[1], email: spec[2], phone: spec[3],
    status: 'active', contractValue: spec[4], slaScore: spec[5], renewalDate: new Date(now.getTime() + (30 + index * 17) * 86400000), createdAt: now,
  }))).returning()

  const siteRows = await db.insert(sites).values(siteSpecs.map((site, index) => ({
    userId, organizationId, name: site.name, address: `${site.address}, ${site.state}`,
    latitude: site.latitude, longitude: site.longitude, geofenceRadius: [120, 180, 250, 90][index % 4],
    status: index === 7 ? 'inactive' : 'active', dangerLevel: index % 7 === 0 ? 'high' : index % 3 === 0 ? 'medium' : 'low',
    clientId: clientRows[site.client].id, createdAt: now,
  }))).returning()

  const guardSiteIndex: number[] = []
  siteSpecs.forEach((site, siteIndex) => { for (let i = 0; i < site.guards; i += 1) guardSiteIndex.push(siteIndex) })
  const guardRows = await db.insert(guards).values(guardNames.map((name, index) => {
    const site = siteRows[guardSiteIndex[index]]
    const shift = shiftPresets[index % shiftPresets.length]
    const suspended = index === 47 || index === 48
    const hasLocation = !suspended && index % 9 !== 0
    return {
      userId, organizationId, name, guardCode: String(index + 1).padStart(3, '0'), nin: `10${String(index + 1).padStart(9, '0')}`,
      phone: `0803${String(2000000 + index * 713).padStart(7, '0')}`, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      status: suspended ? 'suspended' : 'active', suspendedAt: suspended ? new Date(now.getTime() - 6 * 86400000) : null,
      site: site.name, nfcToken: `BOS-DEMO-${String(index + 1).padStart(3, '0')}`, photoUrl: null,
      monthlySalary: 150000 + (index % 8) * 12000, shiftStartHour: shift.shiftStartHour, shiftEndHour: shift.shiftEndHour,
      lastCheckIn: hasLocation ? new Date(now.getTime() - (index % 9) * 3600000) : null,
      lastLatitude: hasLocation ? jitter(site.latitude) : null, lastLongitude: hasLocation ? jitter(site.longitude) : null,
      loginUserId: null, createdAt: new Date(now.getTime() - (index < 12 ? index : 120 - index) * 86400000),
    }
  })).returning()

  const guardBySite = new Map(siteRows.map((site) => [site.name, guardRows.filter((guard) => guard.site === site.name)]))
  const siteOf = (guard: typeof guardRows[number]) => siteRows.find((site) => site.name === guard.site) ?? siteRows[0]

  const attendanceRows: (typeof attendance.$inferInsert)[] = []
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = lagosDate(offset)
    for (const [index, guard] of guardRows.entries()) {
      if (guard.status === 'suspended') continue
      const chance = offset === 0 ? index % 5 !== 0 : index % 7 !== 0
      if (!chance) continue
      const site = siteOf(guard)
      const hour = [6, 7, 7, 8, 9][(index + offset) % 5]
      const at = atLagos(date, hour, (index * 7 + offset * 3) % 55)
      const outside = (index + offset) % 19 === 0
      attendanceRows.push({
        userId, organizationId, guardId: guard.id, siteId: site.id, checkedInAt: at,
        checkedOutAt: new Date(at.getTime() + (8 + (index % 4)) * 3600000),
        latitude: jitter(site.latitude, outside ? 0.012 : 0.001), longitude: jitter(site.longitude, outside ? 0.012 : 0.001),
        method: index % 3 === 0 ? 'gps' : 'nfc', withinGeofence: !outside,
        reviewStatus: outside ? 'flagged' : 'approved', createdAt: at,
      })
    }
  }
  for (const rows of chunk(attendanceRows, 250)) await db.insert(attendance).values(rows)

  const patrolRows: (typeof patrols.$inferInsert)[] = []
  const signedByKey = new Map<string, string[]>()
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = lagosDate(offset)
    for (const [index, guard] of guardRows.entries()) {
      if (guard.status === 'suspended') continue
      const site = siteOf(guard)
      const shift = guardShift(guard, { startHour: 8, endHour: 18 })
      const slots = patrolSlots(shift)
      if (!slots.length) continue
      const currentSlotHour = Number(String(currentHour).padStart(2, '0'))
      const currentIndex = slots.findIndex((slot) => Number(slot.slice(0, 2)) === currentSlotHour)
      let signedCount: number
      if (offset === 0) signedCount = currentIndex < 0 ? 0 : Math.max(0, currentIndex + 1 - (index % 4 === 0 ? 1 : 0))
      else {
        const mode = (index + offset * 3) % 10
        signedCount = mode < 6 ? slots.length : mode < 8 ? Math.max(1, slots.length - 1 - (mode % 2)) : Math.floor(slots.length * 0.55)
      }
      signedCount = Math.min(signedCount, slots.length)
      const key = `${guard.id}:${date}`
      signedByKey.set(key, slots.slice(0, signedCount))
      const start = atLagos(date, shift.startHour, 0)
      const progress = Math.round((signedCount / slots.length) * 100)
      patrolRows.push({
        userId, organizationId, guardId: guard.id, siteId: site.id, loggedAt: start, patrolDate: date,
        latitude: jitter(site.latitude), longitude: jitter(site.longitude), method: index % 2 === 0 ? 'nfc' : 'gps',
        withinBounds: (index + offset) % 13 !== 0, routeName: `Route ${String.fromCharCode(65 + (index % 4))}`,
        checkpoint: 'Main gate', progress, status: signedCount >= slots.length ? 'completed' : offset === 0 ? 'in_progress' : 'missed', createdAt: start,
      })
    }
  }
  const patrolRowsInserted = await db.insert(patrols).values(patrolRows).returning()
  const checkpoints: (typeof patrolCheckpoints.$inferInsert)[] = []
  for (const patrol of patrolRowsInserted) {
    const date = patrol.patrolDate as string
    const guard = guardRows.find((item) => item.id === patrol.guardId)!
    const shift = guardShift(guard, { startHour: 8, endHour: 18 })
    const signedSlots = signedByKey.get(`${guard.id}:${date}`) ?? []
    for (const slot of signedSlots) {
      const hour = Number(slot.slice(0, 2))
      const crosses = shift.endHour <= shift.startHour && hour < shift.startHour
      const signedAt = atLagos(crosses ? lagosDate(-1) : date, hour, (hour * 7) % 50)
      checkpoints.push({ userId, organizationId, patrolId: patrol.id, slot, signedAt })
    }
  }
  for (const rows of chunk(checkpoints, 300)) await db.insert(patrolCheckpoints).values(rows)

  const incidentSpecs = [
    ['Attempted break-in at the rear gate', 'critical', 'open', 'Transcorp Hilton Abuja', 'Two men tried to force the rear gate open around 02:10. The guard raised the alarm and they fled.'],
    ['Unauthorised vehicle at loading bay', 'low', 'open', 'Jabi Lake Mall', 'Vehicle without a pass stayed at the loading bay for 40 minutes.'],
    ['Floodlight failure on the east side', 'medium', 'resolved', 'Wuse Market Complex', 'Floodlight stopped working after the storm. Electrician booked and repair completed.'],
    ['Suspicious package near concierge', 'high', 'escalated', 'Eko Atlantic Tower', 'Unattended bag found beside the concierge desk. Police notified and area cordoned.'],
    ['Fire alarm triggered on level 3', 'medium', 'resolved', 'Victoria Island Office Park', 'Alarm triggered by cooking smoke. Building evacuated and cleared by fire service.'],
    ['Tailgating at staff entrance', 'low', 'open', 'Lekki Phase 1 Estate', 'Two people entered behind a resident without scanning. Reviewed on CCTV.'],
    ['Perimeter fence damage', 'high', 'open', 'Apapa Port Gate', 'Section of the perimeter fence was cut overnight. Temporary repair in place.'],
    ['Missing radio handset', 'low', 'resolved', 'Port Harcourt Mall', 'Handset was left in the control room and recovered at shift change.'],
    ['Customer altercation', 'medium', 'resolved', 'Ado Bayero Mall', 'Verbal altercation between customers resolved by security.'],
    ['Unauthorised roof access', 'critical', 'open', 'Ibadan Palms', 'Contractor used an unapproved access route to the roof. Work stopped and permits checked.'],
    ['Gate barrier malfunction', 'medium', 'escalated', 'Kaduna Central Market', 'Barrier failed in the raised position during morning deliveries.'],
    ['Lost child reunited with parent', 'low', 'resolved', 'Asaba Mall', 'Child found near the food court and reunited after 20 minutes.'],
  ] as const
  await db.insert(incidents).values(incidentSpecs.map((spec, index) => ({
    userId, organizationId, title: spec[0], description: spec[4], severity: spec[1], status: spec[2], site: spec[3],
    assigneeId: guardRows[index % guardRows.length].id, comments: [],
    timeline: [`${new Date(now.getTime() - (index + 1) * 3600000).toISOString()} Incident reported`, ...(spec[2] === 'resolved' ? [`${new Date(now.getTime() - index * 1800000).toISOString()} Resolved by control room`] : [])],
    reportedAt: new Date(now.getTime() - (index + 1) * 3600000), createdAt: new Date(now.getTime() - (index + 1) * 3600000),
  })))

  const alertTypes = ['sos', 'geofence', 'patrol', 'attendance', 'incident'] as const
  const alertSpecs = [
    ['SOS activated', 'critical', false], ['Geofence breach', 'high', false], ['Missed patrol', 'medium', true],
    ['Missed morning sign-in', 'high', false], ['Geofence breach', 'high', true], ['High incident reported', 'high', false],
    ['Missed patrol', 'medium', false], ['SOS test acknowledged', 'critical', true], ['Missed morning sign-in', 'high', true],
    ['Geofence breach', 'high', false], ['Missed patrol', 'medium', true], ['High incident reported', 'high', false],
    ['Missed morning sign-in', 'high', false], ['Geofence breach', 'high', true],
  ] as const
  await db.insert(alerts).values(alertSpecs.map((spec, index) => {
    const site = siteRows[index % siteRows.length]
    const guard = guardRows[index % guardRows.length]
    return {
      userId, organizationId, type: alertTypes[index % alertTypes.length], title: `${spec[0]}: ${guard.name}`, body: `${guard.name} · ${site.name}`,
      severity: spec[1], acknowledged: spec[2], dedupeKey: `demo:${index}`, createdAt: new Date(now.getTime() - (index + 1) * 7200000),
    }
  }))

  const staffSpecs = [
    ['Grace Nwosu', 'Operations manager', 420000], ['Samuel Adeyinka', 'Control room supervisor', 310000],
    ['Halima Bala', 'Client relations lead', 290000], ['Emeka Uche', 'Field inspector', 240000],
    ['Tolu Okiki', 'Payroll officer', 260000], ['Nnamdi Eze', 'Training coordinator', 230000],
  ] as const
  await db.insert(staff).values(staffSpecs.map((spec, index) => ({ userId, organizationId, name: spec[0], title: spec[1], phone: `0803 200 30${index}`, monthlySalary: spec[2], startDate: `2024-0${(index % 8) + 1}-01`, status: 'active', createdAt: now })))

  const inventorySpecs = [
    ['NFC patrol tags', 'Equipment', 148, 40, 'Abuja store', 2500], ['Guard uniforms (set)', 'Uniform', 96, 30, 'Lagos store', 12000],
    ['Two-way radios', 'Equipment', 22, 30, 'Control room', 45000], ['Torches', 'Equipment', 41, 15, 'Abuja store', 8500],
    ['Rain coats', 'Uniform', 55, 20, 'Lagos store', 9500], ['First aid kits', 'Safety', 18, 10, 'Control room', 18000],
    ['Body cameras', 'Equipment', 11, 15, 'Control room', 65000], ['Visitor badge packs', 'Accessories', 34, 20, 'Reception', 3000],
    ['Handcuffs', 'Equipment', 28, 10, 'Armory', 15000], ['Fire extinguishers', 'Safety', 16, 12, 'Stores', 22000],
  ] as const
  await db.insert(inventoryItems).values(inventorySpecs.map((spec, index) => ({ userId, organizationId, name: spec[0], category: spec[1], quantity: spec[2], minQuantity: spec[3], location: spec[4], unitCost: spec[5], notes: spec[2] < spec[3] ? 'Below minimum — reorder' : null, createdAt: now })))

  await db.insert(contracts).values(clientRows.map((client, index) => ({
    userId, organizationId, clientName: client.name, title: `Manned guarding — ${client.name}`,
    sites: siteRows.filter((site) => site.clientId === client.id).map((site) => site.name).join(', '),
    monthlyFee: client.contractValue / 12, startDate: '2025-01-01', endDate: '2026-12-31',
    nextDueDate: lagosDate(-(index % 5) * 7), paymentStatus: index % 3 === 0 ? 'pending' : 'paid', createdAt: now,
  })))

  const financeRows: (typeof finances.$inferInsert)[] = []
  clientRows.forEach((client, index) => {
    financeRows.push({ userId, organizationId, kind: 'income', label: `${client.name} guarding retainer`, amount: client.contractValue / 12, status: index % 4 === 0 ? 'pending' : 'paid', dueDate: new Date(now.getTime() + (30 - index) * 86400000), clientId: client.id, siteId: siteRows.find((site) => site.clientId === client.id)?.id ?? null, category: 'retainer', notes: 'Monthly guarding retainer', createdAt: new Date(now.getTime() - (index + 1) * 86400000) })
  })
  for (const [index, item] of [['Duty vehicle maintenance', 185000], ['Control room internet', 64000], ['Guard training refresh', 240000], ['Uniform replacement', 320000], ['Fuel and transport', 410000], ['Radio repairs', 95000], ['Site consumables', 120000], ['NFC tag replacement', 85000]].entries()) {
    financeRows.push({ userId, organizationId, kind: 'expense', label: item[0] as string, amount: item[1] as number, status: index % 2 === 0 ? 'paid' : 'pending', dueDate: new Date(now.getTime() + (index - 3) * 86400000), category: 'operations', notes: null, createdAt: new Date(now.getTime() - (index + 1) * 86400000) })
  }
  await db.insert(finances).values(financeRows)

  const payrollRows: (typeof payrollRecords.$inferInsert)[] = []
  const periods = [0, 1, 2].map((offset) => { const d = new Date(now.getFullYear(), now.getMonth() - offset, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` })
  for (const [periodIndex, period] of periods.entries()) {
    for (const [index, guard] of guardRows.entries()) {
      const daysPresent = guard.status === 'suspended' ? 12 : 20 + ((index + periodIndex) % 9)
      const daysAbsent = 30 - daysPresent
      const absenceDeduction = Math.round(guard.monthlySalary / 30 * daysAbsent)
      const pension = Math.round(guard.monthlySalary * 0.08)
      payrollRows.push({ userId, organizationId, guardId: guard.id, kind: 'guard', period, status: periodIndex === 0 ? 'pending' : 'paid', baseSalary: guard.monthlySalary, daysInPeriod: 30, daysPresent, daysAbsent, absenceDeduction, pension, netPay: guard.monthlySalary - absenceDeduction - pension, paidAt: periodIndex === 0 ? null : new Date(now.getTime() - periodIndex * 30 * 86400000), createdAt: now })
    }
  }
  for (const rows of chunk(payrollRows, 200)) await db.insert(payrollRecords).values(rows)

  const activitySpecs = [
    ['guard', 'Morning shift coverage recorded', '44 guards checked in across Abuja, Lagos and Port Harcourt.', 'success'],
    ['site', 'Ibadan Palms flagged high risk', 'A critical incident was reported in the last 30 days.', 'warning'],
    ['incident', 'Suspicious package escalated', 'Eko Atlantic Tower alert escalated to control room.', 'warning'],
    ['client', 'South-South Facilities contract renewed', 'Contract renewed for another 12 months.', 'success'],
    ['guard', 'New guards added to the roster', 'Five guards completed onboarding and were deployed.', 'neutral'],
    ['patrol', 'Night patrols completed', 'All scheduled checkpoints were signed at Trans Amadi.', 'success'],
    ['finance', 'Retainer marked paid', 'Eko Atlantic Facilities monthly retainer received.', 'success'],
    ['attendance', 'Geofence exception reviewed', 'Outside-geofence check-in cleared by the supervisor.', 'neutral'],
  ] as const
  await db.insert(activityEvents).values(Array.from({ length: 28 }, (_, index) => {
    const spec = activitySpecs[index % activitySpecs.length]
    return { userId, organizationId, type: spec[0], title: spec[1], body: spec[2], tone: spec[3], createdAt: new Date(now.getTime() - index * 3 * 3600000) }
  }))

  const locationRows: (typeof guardLocations.$inferInsert)[] = []
  for (const [index, guard] of guardRows.entries()) {
    if (guard.status === 'suspended') continue
    const site = siteOf(guard)
    for (let point = 0; point < 4; point += 1) {
      locationRows.push({
        organizationId, guardId: guard.id, siteId: site.id, latitude: jitter(site.latitude, 0.002), longitude: jitter(site.longitude, 0.002),
        batteryLevel: 40 + ((index * 7 + point * 11) % 60), accuracy: 4 + ((index + point) % 18), speed: point % 2 === 0 ? 0 : 0.8,
        source: 'gps', recordedAt: new Date(now.getTime() - point * 25 * 60000), createdAt: now,
      })
    }
  }
  for (const rows of chunk(locationRows, 250)) await db.insert(guardLocations).values(rows)

  console.log(JSON.stringify({ ok: true, organizationId, clients: clientRows.length, sites: siteRows.length, guards: guardRows.length, attendance: attendanceRows.length, patrols: patrolRows.length, checkpoints: checkpoints.length, incidents: incidentSpecs.length, alerts: alertSpecs.length, payroll: payrollRows.length, locations: locationRows.length }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => pool.end())
