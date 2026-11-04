import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentClient } from '@/lib/db'
import { actor, can, denyGuard, fail } from '@/lib/server'
import { tenantScoped } from '@/lib/tenant'

type Col = { key: string; column: string }
/** Small organisation-scoped CRUD handler for finance records (contracts, inventory, staff). Read needs "view finance", writes need "approve payroll". */
export function financeCrud(table: string, cols: Col[], create: z.ZodType<Record<string, unknown>>, patch: z.ZodType<Record<string, unknown>>, order: string) {
  const row = (r: Record<string, unknown>) => { const out: Record<string, unknown> = { id: r.id, createdAt: r.created_at }; for (const c of cols) out[c.key] = r[c.column]; return out }
  async function gate(write: boolean) {
    const current = await actor(); if (!current) return { error: fail('Sign in first.', 401) }
    const denied = denyGuard(current); if (denied) return { error: denied }
    if (!(await can(current, write ? 'runPayroll' : 'viewFinance'))) return { error: fail(write ? 'Your role cannot change finance records.' : 'Your role cannot view finance.', 403) }
    return { current }
  }
  return {
    GET: tenantScoped(async () => {
      const g = await gate(false); if (!g.current) return g.error
      const r = await currentClient().query(`select * from ${table} order by ${order}`)
      return NextResponse.json(r.rows.map(row))
    }),
    POST: tenantScoped(async (request: Request) => {
      const g = await gate(true); if (!g.current) return g.error
      const p = create.safeParse(await request.json().catch(() => null)); if (!p.success) return fail(p.error.issues[0]?.message ?? 'Check the details and try again.')
      const used = cols.filter((c) => p.data[c.key] !== undefined)
      const r = await currentClient().query(`insert into ${table} (user_id, organization_id, ${used.map((c) => c.column).join(',')}, created_at) values ($1,$2,${used.map((_, i) => `$${i + 3}`).join(',')}, now()) returning *`, [g.current.userId, g.current.organizationId, ...used.map((c) => p.data[c.key])])
      return NextResponse.json(row(r.rows[0]), { status: 201 })
    }),
    PATCH: tenantScoped(async (request: Request) => {
      const g = await gate(true); if (!g.current) return g.error
      const body = await request.json().catch(() => null) as Record<string, unknown> | null
      const id = z.string().uuid().safeParse(body?.id); if (!id.success) return fail('Invalid id')
      const p = patch.safeParse(body); if (!p.success) return fail(p.error.issues[0]?.message ?? 'Check the details and try again.')
      const used = cols.filter((c) => p.data[c.key] !== undefined); if (!used.length) return fail('Nothing to change.')
      const r = await currentClient().query(`update ${table} set ${used.map((c, i) => `${c.column} = $${i + 2}`).join(', ')} where id = $1 returning *`, [id.data, ...used.map((c) => p.data[c.key])])
      return r.rows[0] ? NextResponse.json(row(r.rows[0])) : fail('Not found', 404)
    }),
    DELETE: tenantScoped(async (request: Request) => {
      const g = await gate(true); if (!g.current) return g.error
      const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('id')); if (!id.success) return fail('Invalid id')
      await currentClient().query(`delete from ${table} where id = $1`, [id.data])
      return NextResponse.json({ ok: true })
    }),
  }
}
