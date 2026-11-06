import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireWorkspace()
  redirect('/overview')
}
