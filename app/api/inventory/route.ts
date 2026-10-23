import { z } from 'zod'
import { financeCrud } from '@/lib/crud'

const base = z.object({ name: z.string().trim().min(2), category: z.string().trim().min(2), quantity: z.coerce.number().int().min(0), minQuantity: z.coerce.number().int().min(0), location: z.string().trim().max(150).nullish(), unitCost: z.coerce.number().int().min(0), notes: z.string().trim().max(300).nullish() })
const h = financeCrud('inventory_items', [['name', 'name'], ['category', 'category'], ['quantity', 'quantity'], ['minQuantity', 'min_quantity'], ['location', 'location'], ['unitCost', 'unit_cost'], ['notes', 'notes']].map(([key, column]) => ({ key, column })), base.partial({ minQuantity: true, unitCost: true, location: true, notes: true }), base.partial(), 'name asc')
export const dynamic = 'force-dynamic'
export const { GET, POST, PATCH, DELETE } = h
