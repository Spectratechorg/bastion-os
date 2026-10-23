import { NextResponse } from 'next/server'
import { actor, fail, permissionsFor } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** The signed-in user's role and permission switches, used by the app shell to limit what each role sees. */
export async function GET() {
  const current = await actor(); if (!current) return fail('Not signed in', 401)
  return NextResponse.json({ role: current.role, permissions: await permissionsFor(current.organizationId, current.role) })
}
