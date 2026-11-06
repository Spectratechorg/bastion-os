export type Shift = { startHour: number; endHour: number }

/** Default shift covers standard daytime hours 08:00 to 18:00. */
export const DEFAULT_SHIFT: Shift = { startHour: 8, endHour: 18 }

/** Normalizes shift hours, supporting both daytime shifts (e.g. 8 to 18) and overnight shifts (e.g. 21 to 12). */
export function normalizeShift(startHour: unknown, endHour: unknown): Shift {
  const start = Number(startHour)
  const end = Number(endHour)
  const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= 23 && end >= 0 && end <= 24 && start !== end
  return valid ? { startHour: start, endHour: end } : DEFAULT_SHIFT
}

/** Array of hourly checkpoint time strings inside the shift (e.g. 21:00 to 12:00 spans 15 hourly checkpoints). */
export function patrolSlots({ startHour, endHour }: Shift): string[] {
  if (endHour > startHour) {
    return Array.from({ length: endHour - startHour }, (_, index) => `${String(startHour + index).padStart(2, '0')}:00`)
  }
  const nightSlots = Array.from({ length: 24 - startHour }, (_, index) => `${String(startHour + index).padStart(2, '0')}:00`)
  const morningSlots = Array.from({ length: endHour }, (_, index) => `${String(index).padStart(2, '0')}:00`)
  return [...nightSlots, ...morningSlots]
}

/** The checkpoint a signature at this Lagos hour belongs to, or null when outside the shift. */
export function slotForHour(hour: number, shift: Shift = DEFAULT_SHIFT): string | null {
  if (shift.endHour > shift.startHour) {
    if (hour < shift.startHour || hour >= shift.endHour) return null
    return `${String(hour).padStart(2, '0')}:00`
  }
  // Overnight shift (e.g. 21:00 to 12:00)
  if (hour >= shift.startHour || hour < shift.endHour) {
    return `${String(hour).padStart(2, '0')}:00`
  }
  return null
}

/** Whether the current hour falls inside the active shift. */
export function isShiftActive(hour: number, shift: Shift = DEFAULT_SHIFT): boolean {
  if (shift.endHour > shift.startHour) {
    return hour >= shift.startHour && hour < shift.endHour
  }
  return hour >= shift.startHour || hour < shift.endHour
}

export function getNextDateString(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+01:00`)
  d.setDate(d.getDate() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getPrevDateString(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+01:00`)
  d.setDate(d.getDate() - 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Determines the base date of the active shift (if past midnight on an overnight shift, duty began yesterday). */
export function currentShiftDate(now: { date: string; hour: number }, shift: Shift = DEFAULT_SHIFT): string {
  if (shift.endHour <= shift.startHour && now.hour < shift.endHour) {
    return getPrevDateString(now.date)
  }
  return now.date
}

/** Whether the shift window for a given duty date has closed. */
export function isShiftClosed(shiftDate: string, now: { date: string; hour: number }, shift: Shift = DEFAULT_SHIFT): boolean {
  if (shift.endHour > shift.startHour) {
    if (shiftDate < now.date) return true
    if (shiftDate === now.date && now.hour >= shift.endHour) return true
    return false
  }
  const nextDay = getNextDateString(shiftDate)
  if (now.date > nextDay) return true
  if (now.date === nextDay && now.hour >= shift.endHour) return true
  return false
}
