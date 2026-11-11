import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAndSummarizeGuards, type GuardRecordForAi } from '../lib/napoleon-filters'

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
