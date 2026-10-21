import { GuardRegisterPage } from '@/components/guard-register-page'
import { WorkspaceShell } from '@/components/workspace-shell'

export default function AddGuardPage() {
  return <WorkspaceShell active="Guards"><GuardRegisterPage /></WorkspaceShell>
}
