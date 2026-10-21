export type Shift = { startHour: number; endHour: number }

/** One patrol checkpoint per hour, from the shift start up to (but not including) the shift end. */
export const DEFAULT_SHIFT: Shift = { startHour: 8, endHour: 18 }

export function normalizeShift(startHour: unknown, endHour: unknown): Shift {
  const start = Number(startHour)
  const end = Number(endHour)
  const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 24 && end > start
  return valid ? { startHour: start, endHour: end } : DEFAULT_SHIFT
}

export function patrolSlots({ startHour, endHour }: Shift) {
  return Array.from({ length: Math.max(endHour - startHour, 0) }, (_, index) => `${String(startHour + index).padStart(2, '0')}:00`)
}

/** The checkpoint a signature at this Lagos hour belongs to, or null when outside the shift. */
export function slotForHour(hour: number, shift: Shift = DEFAULT_SHIFT) {
  if (hour < shift.startHour || hour >= shift.endHour) return null
  return `${String(hour).padStart(2, '0')}:00`
}
