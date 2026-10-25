import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_PERMISSIONS, EDITABLE_ROLES } from '../lib/permissions'
import { computePayroll } from '../lib/payroll'
import { ALERT_RULES } from '../lib/alerts-client'

test('guards have no dashboard permissions and owners have all', () => {
  assert.ok(Object.values(DEFAULT_PERMISSIONS.guard).every((value) => value === false))
  assert.ok(Object.values(DEFAULT_PERMISSIONS.owner).every((value) => value === true))
  assert.deepEqual([...EDITABLE_ROLES], ['admin', 'moderator', 'member'])
})

test('payroll has no pension: net = base - absence', () => {
  const full = computePayroll({ baseSalary: 150000, daysInMonth: 30, daysCounted: 30, daysPresent: 28, prorated: false })
  assert.equal(full.absenceDeduction, 10000)
  assert.equal(full.netPay, 140000)
  const joined = computePayroll({ baseSalary: 150000, daysInMonth: 30, daysCounted: 15, daysPresent: 15, prorated: true })
  assert.equal(joined.netPay, 75000)
})

test('every alert type explains its severity', () => {
  for (const type of ['sos', 'geofence', 'incident', 'patrol']) assert.ok(ALERT_RULES[type].rule.length > 10)
})
