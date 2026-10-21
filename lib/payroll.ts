export type PayrollInput = { baseSalary: number; daysInMonth: number; daysCounted: number; daysPresent: number }

/**
 * Pay = base salary - (daily rate x days absent). There is no overtime or pension deduction.
 * Days absent are the counted days (from the guard's start date up to today, or month end)
 * on which the guard has no attendance record.
 */
export function computePayroll({ baseSalary, daysInMonth, daysCounted, daysPresent }: PayrollInput) {
  const present = Math.min(daysPresent, daysCounted)
  const daysAbsent = Math.max(daysCounted - present, 0)
  const absenceDeduction = Math.round((baseSalary / daysInMonth) * daysAbsent)
  const netPay = Math.max(baseSalary - absenceDeduction, 0)
  return { daysPresent: present, daysAbsent, absenceDeduction, netPay }
}

export function monthBounds(period: string) {
  const [year, month] = period.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { year, month, daysInMonth }
}
