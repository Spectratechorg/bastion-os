import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

export default async function SettingsIndexPage() {
  await requireWorkspace()
  return <WorkspacePage route="settings" />
}
