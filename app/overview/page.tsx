import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export default async function OverviewRoute() {
  await requireWorkspace()
  return <WorkspacePage route="overview" />
}
