import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePayroll } from '../lib/payroll'
import { slotForHour } from '../lib/server-rules'

test('payroll: absence deduction, no pension or overtime', () => {
  const r = computePayroll({ baseSalary: 180000, daysInMonth: 31, daysCounted: 6, daysPresent: 1 })
  assert.deepEqual(r, { daysPresent: 1, daysAbsent: 5, absenceDeduction: 29032, netPay: 150968 })
})
test('payroll: never negative, present capped at counted days', () => {
  assert.equal(computePayroll({ baseSalary: 10000, daysInMonth: 30, daysCounted: 30, daysPresent: 0 }).netPay, 0)
  assert.equal(computePayroll({ baseSalary: 10000, daysInMonth: 30, daysCounted: 3, daysPresent: 9 }).daysAbsent, 0)
})
test('patrol: window 09:00-12:59 maps to 10:00, 11:00, 12:00', () => {
  assert.equal(slotForHour(8), null); assert.equal(slotForHour(9), '10:00'); assert.equal(slotForHour(10), '10:00')
  assert.equal(slotForHour(11), '11:00'); assert.equal(slotForHour(12), '12:00'); assert.equal(slotForHour(13), null)
})
