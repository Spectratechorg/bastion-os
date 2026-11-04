import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function NapoleonPage() {
  await requireWorkspace()
  return <WorkspacePage route="napoleon" />
}
