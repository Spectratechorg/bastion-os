import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export default async function ProfileRoute() {
  await requireWorkspace()
  return <WorkspacePage route="profile" />
}
