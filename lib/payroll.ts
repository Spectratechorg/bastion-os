export type PayrollInput = { baseSalary: number; daysInMonth: number; daysCounted: number; daysPresent: number; prorated: boolean }

/**
 * Whole-month guards earn the full monthly salary minus a day's pay per uncounted day.
 * Guards who joined during the month earn only the days since they joined (pro-rata).
 * There is no overtime or pension deduction.
 */
export function computePayroll({ baseSalary, daysInMonth, daysCounted, daysPresent, prorated }: PayrollInput) {
  const dailyRate = baseSalary / daysInMonth
  const present = Math.min(daysPresent, daysCounted)
  const daysAbsent = Math.max(daysCounted - present, 0)
  const basePay = prorated ? Math.round(dailyRate * daysCounted) : baseSalary
  const absenceDeduction = Math.round(dailyRate * daysAbsent)
  const netPay = Math.max(basePay - absenceDeduction, 0)
  return { daysPresent: present, daysAbsent, absenceDeduction, basePay, netPay }
}

export function monthBounds(period: string) {
  const [year, month] = period.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { year, month, daysInMonth }
}
