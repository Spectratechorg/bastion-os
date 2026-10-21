import { GuardRegisterPage } from '@/components/guard-register-page'
import { WorkspaceShell } from '@/components/workspace-shell'
import { requireWorkspace } from '@/lib/session'

export default async function AddGuardPage() {
  await requireWorkspace()
  return <WorkspaceShell active="Guards"><GuardRegisterPage /></WorkspaceShell>
}
