import { z } from 'zod'

export const GuardPingSchema = z.object({
  guardId: z.string().min(1, 'guardId is required'),
  organizationId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  batteryLevel: z.number().min(0).max(100).optional().nullable(),
  accuracy: z.number().optional().nullable(),
  speed: z.number().optional().nullable(),
  timestamp: z.union([z.string(), z.number(), z.date()]).optional(),
})

export type GuardPing = z.infer<typeof GuardPingSchema>

export type ProcessedPingResult = {
  insertedLocations: number
  updatedGuards: number
  errors: number
}
