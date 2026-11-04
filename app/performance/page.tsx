import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export default async function LatencyPage() {
  await requireWorkspace()
  return <WorkspacePage route="performance" />
}
