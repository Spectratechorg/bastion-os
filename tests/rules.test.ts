import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePayroll } from '../lib/payroll'
import { slotForHour } from '../lib/server-rules'

test('payroll: whole-month guard loses a day for each day without attendance', () => {
  const r = computePayroll({ baseSalary: 180000, daysInMonth: 31, daysCounted: 6, daysPresent: 1, prorated: false })
  assert.deepEqual(r, { daysPresent: 1, daysAbsent: 5, absenceDeduction: 29032, basePay: 180000, netPay: 150968 })
})
test('payroll: guard who joined mid-month is paid pro-rata', () => {
  const full = computePayroll({ baseSalary: 310000, daysInMonth: 31, daysCounted: 10, daysPresent: 10, prorated: true })
  assert.deepEqual(full, { daysPresent: 10, daysAbsent: 0, absenceDeduction: 0, basePay: 100000, netPay: 100000 })
  const withAbsence = computePayroll({ baseSalary: 310000, daysInMonth: 31, daysCounted: 10, daysPresent: 8, prorated: true })
  assert.deepEqual(withAbsence, { daysPresent: 8, daysAbsent: 2, absenceDeduction: 20000, basePay: 100000, netPay: 80000 })
})
test('payroll: never negative, present capped at counted days', () => {
  assert.equal(computePayroll({ baseSalary: 10000, daysInMonth: 30, daysCounted: 30, daysPresent: 0, prorated: false }).netPay, 0)
  assert.equal(computePayroll({ baseSalary: 10000, daysInMonth: 30, daysCounted: 3, daysPresent: 9, prorated: false }).daysAbsent, 0)
})
test('patrol: window 09:00-12:59 maps to 10:00, 11:00, 12:00', () => {
  assert.equal(slotForHour(8), null); assert.equal(slotForHour(9), '10:00'); assert.equal(slotForHour(10), '10:00')
  assert.equal(slotForHour(11), '11:00'); assert.equal(slotForHour(12), '12:00'); assert.equal(slotForHour(13), null)
})
