import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type ClientRecordForAi,
  type ContractRecordForAi,
  filterAndSummarizeGuards,
  filterClientsAndContracts,
  type GuardRecordForAi,
  type SiteRecordForAi,
} from '../lib/napoleon-filters'
import { parseInlineSegments, parseMarkdownBlocks } from '../lib/napoleon-markdown'

const sampleGuards: GuardRecordForAi[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    guardCode: '001',
    name: 'Amina Bello',
    status: 'active',
    site: 'Ibadan Palms',
    monthlySalary: 60000,
    shiftStartHour: null,
    shiftEndHour: null,
    lastCheckIn: new Date('2026-11-11T19:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    loginUserId: null,
    nfcToken: 'secret-token-001',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    guardCode: '052',
    name: 'koro musa',
    status: 'active',
    site: 'Ibadan Palms',
    monthlySalary: 150000,
    shiftStartHour: 21,
    shiftEndHour: 12,
    lastCheckIn: new Date('2026-11-11T19:33:00Z'),
    createdAt: new Date('2026-11-11T16:21:00Z'),
    loginUserId: null,
    nfcToken: '46d6860d-a708-4e5c-89fc-82f826193447',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    guardCode: '053',
    name: 'Chinedu Okafor',
    status: 'suspended',
    site: null,
    monthlySalary: 234000,
    shiftStartHour: null,
    shiftEndHour: null,
    lastCheckIn: null,
    createdAt: new Date('2026-10-05T00:00:00Z'),
    loginUserId: 'user-3',
    nfcToken: 'secret-token-053',
  },
]

const defaultShift = { startHour: 8, endHour: 18 }

test('napoleon guard query counts strictly above vs at-least salary thresholds', () => {
  const strictlyAbove = filterAndSummarizeGuards(sampleGuards, { minSalaryExclusive: 60000 }, true, defaultShift)
  assert.equal('error' in strictlyAbove, false)
  if ('error' in strictlyAbove) return
  assert.ok('salaryStats' in strictlyAbove && strictlyAbove.salaryStats)
  if (!('salaryStats' in strictlyAbove)) return
  assert.equal(strictlyAbove.matchedCount, 2)
  assert.equal(strictlyAbove.totalGuardsInOrganization, 3)
  assert.equal(strictlyAbove.salaryStats?.totalMonthlySalary, 384000)
  assert.equal(strictlyAbove.salaryStats?.minSalary, 150000)
  assert.equal(strictlyAbove.salaryStats?.maxSalary, 234000)

  const inclusive = filterAndSummarizeGuards(sampleGuards, { minSalary: 60000 }, true, defaultShift)
  if ('error' in inclusive) assert.fail('unexpected error')
  assert.equal(inclusive.matchedCount, 3)
})

test('napoleon guard query finds by guardCode, site, and masks secret tokens', () => {
  const found = filterAndSummarizeGuards(sampleGuards, { search: '052' }, true, defaultShift)
  if ('error' in found) assert.fail('unexpected error')
  assert.equal(found.matchedCount, 1)
  assert.equal(found.guards[0]?.name, 'koro musa')
  assert.equal(found.guards[0]?.monthlySalary, 150000)
  assert.equal(found.guards[0]?.shift, '21:00–12:00 (custom)')
  assert.equal(JSON.stringify(found).includes('46d6860d-a708-4e5c-89fc-82f826193447'), false)
})

test('napoleon guard query enforces viewFinance permission', () => {
  const denied = filterAndSummarizeGuards(sampleGuards, { minSalaryExclusive: 60000 }, false, defaultShift)
  assert.equal('error' in denied, true)

  const allowedOps = filterAndSummarizeGuards(sampleGuards, { site: 'Ibadan Palms' }, false, defaultShift)
  if ('error' in allowedOps) assert.fail('non-salary query should succeed')
  assert.equal(allowedOps.matchedCount, 2)
  assert.equal('salaryStats' in allowedOps, false)
  assert.equal('monthlySalary' in allowedOps.guards[0]!, false)
})

const sampleClients: ClientRecordForAi[] = [
  { id: 'c1', name: 'Eko Atlantic Facilities', status: 'active', contractValue: 84_000_000, slaScore: 96, renewalDate: null },
  { id: 'c2', name: 'Lekki Residences Ltd.', status: 'active', contractValue: 72_000_000, slaScore: 91, renewalDate: null },
  { id: 'c3', name: 'Abuja Capital Facilities', status: 'active', contractValue: 96_000_000, slaScore: 94, renewalDate: null },
]

const sampleSites: SiteRecordForAi[] = [
  { id: 's1', name: 'Eko Atlantic Tower', address: '12 Ahmadu Bello Way, Victoria Island, Lagos, Lagos', status: 'active', clientId: 'c1' },
  { id: 's2', name: 'Victoria Island Office Park', address: '4 Adeola Odeku St, Victoria Island, Lagos, Lagos', status: 'active', clientId: 'c1' },
  { id: 's3', name: 'Apapa Port Gate', address: 'Wharf Road, Apapa, Lagos, Lagos', status: 'active', clientId: 'c1' },
  { id: 's4', name: 'Lekki Phase 1 Estate', address: 'Lekki Phase 1, Lagos, Lagos', status: 'active', clientId: 'c2' },
  { id: 's5', name: 'Ikoyi Residences', address: 'Glover Road, Ikoyi, Lagos, Lagos', status: 'active', clientId: 'c2' },
  { id: 's6', name: 'Ikeja City Mall', address: 'Obafemi Awolowo Way, Ikeja, Lagos, Lagos', status: 'inactive', clientId: 'c2' },
  { id: 's7', name: 'Transcorp Hilton Abuja', address: '1 Aguiyi Ironsi St, Maitama, Abuja, FCT', status: 'active', clientId: 'c3' },
]

const sampleContracts: ContractRecordForAi[] = [
  { id: 'ct1', clientName: 'Eko Atlantic Facilities', title: 'Manned guarding — Eko Atlantic', sites: 'Eko Atlantic Tower', monthlyFee: 7_000_000, startDate: '2026-01-01', endDate: '2026-12-31', nextDueDate: '2026-12-01', paymentStatus: 'paid' },
  { id: 'ct2', clientName: 'Lekki Residences Ltd.', title: 'Manned guarding — Lekki', sites: 'Lekki Phase 1 Estate', monthlyFee: 6_000_000, startDate: '2026-01-01', endDate: '2026-12-31', nextDueDate: '2026-12-01', paymentStatus: 'paid' },
  { id: 'ct3', clientName: 'Abuja Capital Facilities', title: 'Manned guarding — Abuja', sites: 'Transcorp Hilton Abuja', monthlyFee: 8_000_000, startDate: '2026-01-01', endDate: '2026-12-31', nextDueDate: '2026-12-01', paymentStatus: 'paid' },
]

test('napoleon client location query strictly excludes non-matching states and sums contractValue', () => {
  const lagos = filterClientsAndContracts(sampleClients, sampleSites, sampleContracts, { location: 'Lagos State' }, true)
  assert.equal(lagos.locationFilter, 'lagos')
  assert.equal(lagos.matchedClientCount, 2)
  assert.ok('totalContractValue' in lagos)
  if (!('totalContractValue' in lagos)) return
  assert.equal(lagos.totalContractValue, 156_000_000)
  assert.equal(lagos.clients.some((c) => c.name.includes('Abuja')), false)
  assert.deepEqual(lagos.clients[0]?.sites, ['Eko Atlantic Tower', 'Victoria Island Office Park', 'Apapa Port Gate'])
  assert.equal(lagos.contractsSummary?.matchedCount, 2)

  const restricted = filterClientsAndContracts(sampleClients, sampleSites, sampleContracts, { location: 'Lagos' }, false)
  assert.equal(restricted.matchedClientCount, 2)
  assert.equal('totalContractValue' in restricted, false)
  assert.equal('contractValue' in restricted.clients[0]!, false)
})

test('napoleon markdown parser parses headlines, vertical lists, and tables', () => {
  const md = `The total contract value for clients with sites in Lagos State is **₦156,000,000** across 2 clients.

- **Active guards:** 51
- **Suspended guards:** 2

| Client | Lagos Sites | Contract Value |
| :--- | :--- | ---: |
| Eko Atlantic Facilities | Eko Atlantic Tower | ₦84,000,000 |
| Lekki Residences Ltd. | Lekki Phase 1 Estate | ₦72,000,000 |`

  const blocks = parseMarkdownBlocks(md)
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0]?.type, 'paragraph')
  assert.equal(blocks[1]?.type, 'list')
  if (blocks[1]?.type === 'list') {
    assert.equal(blocks[1].items.length, 2)
  }
  assert.equal(blocks[2]?.type, 'table')
  if (blocks[2]?.type === 'table') {
    assert.deepEqual(blocks[2].headers, ['Client', 'Lagos Sites', 'Contract Value'])
    assert.deepEqual(blocks[2].alignments, ['left', 'left', 'right'])
    assert.equal(blocks[2].rows.length, 2)
  }

  const segs = parseInlineSegments('**All 53 guards** earn above `₦60,000`.')
  assert.deepEqual(segs, [
    { type: 'bold', value: 'All 53 guards' },
    { type: 'text', value: ' earn above ' },
    { type: 'code', value: '₦60,000' },
    { type: 'text', value: '.' },
  ])
})
