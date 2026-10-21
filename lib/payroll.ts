export const PENSION_RATE = 0.08 // employee contribution, 8% of monthly salary

export type PayrollInput = { baseSalary: number; daysInMonth: number; daysCounted: number; daysPresent: number }

/**
 * Pay = base salary - (daily rate x days absent) - pension. There is no overtime.
 * Days absent are the counted days (from the guard's start date up to today, or month end)
 * on which the guard has no attendance record.
 */
export function computePayroll({ baseSalary, daysInMonth, daysCounted, daysPresent }: PayrollInput) {
  const present = Math.min(daysPresent, daysCounted)
  const daysAbsent = Math.max(daysCounted - present, 0)
  const absenceDeduction = Math.round((baseSalary / daysInMonth) * daysAbsent)
  const pension = Math.round(baseSalary * PENSION_RATE)
  const netPay = Math.max(baseSalary - absenceDeduction - pension, 0)
  return { daysPresent: present, daysAbsent, absenceDeduction, pension, netPay }
}

export function monthBounds(period: string) {
  const [year, month] = period.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { year, month, daysInMonth }
}
