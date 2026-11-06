import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePayroll } from '../lib/payroll'
import {
  DEFAULT_SHIFT,
  currentShiftDate,
  isShiftActive,
  isShiftClosed,
  normalizeShift,
  patrolSlots,
  slotForHour,
} from '../lib/server-rules'

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

test('patrol: one checkpoint per hour inside standard daytime shift', () => {
  const shift = { startHour: 7, endHour: 12 }
  assert.deepEqual(patrolSlots(shift), ['07:00', '08:00', '09:00', '10:00', '11:00'])
  assert.equal(slotForHour(6, shift), null)
  assert.equal(slotForHour(7, shift), '07:00')
  assert.equal(slotForHour(11, shift), '11:00')
  assert.equal(slotForHour(12, shift), null)
})

test('patrol: overnight shift across midnight (21:00 to 12:00)', () => {
  const nightShift = normalizeShift(21, 12)
  assert.deepEqual(nightShift, { startHour: 21, endHour: 12 })
  const slots = patrolSlots(nightShift)
  assert.equal(slots.length, 15)
  assert.equal(slots[0], '21:00')
  assert.equal(slots[2], '23:00')
  assert.equal(slots[3], '00:00')
  assert.equal(slots[slots.length - 1], '11:00')

  assert.equal(isShiftActive(20, nightShift), false)
  assert.equal(isShiftActive(21, nightShift), true)
  assert.equal(isShiftActive(0, nightShift), true)
  assert.equal(isShiftActive(7, nightShift), true)
  assert.equal(isShiftActive(11, nightShift), true)
  assert.equal(isShiftActive(12, nightShift), false)

  assert.equal(slotForHour(20, nightShift), null)
  assert.equal(slotForHour(21, nightShift), '21:00')
  assert.equal(slotForHour(0, nightShift), '00:00')
  assert.equal(slotForHour(11, nightShift), '11:00')
  assert.equal(slotForHour(12, nightShift), null)

  // Current shift duty date resolution across midnight
  assert.equal(currentShiftDate({ date: '2026-11-06', hour: 21 }, nightShift), '2026-11-06')
  assert.equal(currentShiftDate({ date: '2026-11-06', hour: 23 }, nightShift), '2026-11-06')
  assert.equal(currentShiftDate({ date: '2026-11-07', hour: 0 }, nightShift), '2026-11-06')
  assert.equal(currentShiftDate({ date: '2026-11-07', hour: 8 }, nightShift), '2026-11-06')
  assert.equal(currentShiftDate({ date: '2026-11-07', hour: 12 }, nightShift), '2026-11-07')

  // Shift closing check
  assert.equal(isShiftClosed('2026-11-06', { date: '2026-11-06', hour: 22 }, nightShift), false)
  assert.equal(isShiftClosed('2026-11-06', { date: '2026-11-07', hour: 8 }, nightShift), false)
  assert.equal(isShiftClosed('2026-11-06', { date: '2026-11-07', hour: 12 }, nightShift), true)
})

test('patrol: default shift covers 08:00 to 18:00 and invalid hours fall back', () => {
  assert.equal(patrolSlots(DEFAULT_SHIFT).length, 10)
  assert.deepEqual(normalizeShift(8, 8), DEFAULT_SHIFT)
  assert.deepEqual(normalizeShift('invalid', '12'), DEFAULT_SHIFT)
  assert.deepEqual(normalizeShift('7', '19'), { startHour: 7, endHour: 19 })
  assert.deepEqual(normalizeShift(18, 8), { startHour: 18, endHour: 8 })
})
