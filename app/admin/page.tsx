import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireWorkspace()
  return <WorkspacePage route="admin" />
}
