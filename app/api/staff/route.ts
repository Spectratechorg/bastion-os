import { z } from 'zod'
import { financeCrud } from '@/lib/crud'

const base = z.object({ name: z.string().trim().min(2), title: z.string().trim().min(2), phone: z.string().trim().max(30).nullish(), monthlySalary: z.coerce.number().int().min(0).max(100000000), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date'), status: z.enum(['active', 'inactive']) })
const h = financeCrud('staff', [['name', 'name'], ['title', 'title'], ['phone', 'phone'], ['monthlySalary', 'monthly_salary'], ['startDate', 'start_date'], ['status', 'status']].map(([key, column]) => ({ key, column })), base.partial({ phone: true, status: true }).transform((v) => ({ status: 'active', ...v })), base.partial(), 'name asc')
export const dynamic = 'force-dynamic'
export const { GET, POST, PATCH, DELETE } = h
