export const PATROL_SLOTS = ['10:00', '11:00', '12:00'] as const
export const PATROL_WINDOW = { startHour: 9, endHour: 12 }

/** Which of the three checkpoints a signature at this Lagos hour counts for, or null outside the 09:00-12:59 window. */
export function slotForHour(hour: number): (typeof PATROL_SLOTS)[number] | null {
  if (hour < PATROL_WINDOW.startHour || hour > PATROL_WINDOW.endHour) return null
  return PATROL_SLOTS[Math.min(Math.max(hour, 10), 12) - 10]
}
