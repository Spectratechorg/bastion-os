import { z } from 'zod'
import { financeCrud } from '@/lib/crud'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date')
const base = z.object({ clientName: z.string().trim().min(2), title: z.string().trim().min(2), sites: z.string().trim().max(300).nullish(), monthlyFee: z.coerce.number().int().min(0), startDate: date, endDate: date, nextDueDate: date, paymentStatus: z.enum(['pending', 'paid', 'overdue']) })
const h = financeCrud('contracts', [['clientName', 'client_name'], ['title', 'title'], ['sites', 'sites'], ['monthlyFee', 'monthly_fee'], ['startDate', 'start_date'], ['endDate', 'end_date'], ['nextDueDate', 'next_due_date'], ['paymentStatus', 'payment_status']].map(([key, column]) => ({ key, column })), base.partial({ paymentStatus: true, sites: true }).transform((v) => ({ paymentStatus: 'pending', ...v })), base.partial(), 'next_due_date asc')
export const dynamic = 'force-dynamic'
export const { GET, POST, PATCH, DELETE } = h
