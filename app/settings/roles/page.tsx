import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export default async function RolesPage() {
  await requireWorkspace()
  return <WorkspacePage route="settings" />
}
