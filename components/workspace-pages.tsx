import { WorkspaceShell } from '@/components/workspace-shell'
import { FinanceDataPage } from '@/components/data-pages'
import { ClientsPage } from '@/components/clients-page'
import { ReportsPage } from '@/components/reports-page'
import { SettingsPage } from '@/components/settings-page'
import { AlertsPage } from '@/components/alerts-page'
import { NapoleonLivePage } from '@/components/napoleon-live-page'
import { OperationsLivePage, OverviewLivePage } from '@/components/operations-live-pages'
import { FinancePage } from '@/components/finance-page'
import { PatrolsPage } from '@/components/patrols-page'
import { ProfilePage } from '@/components/profile-page'

type OperationalSection = 'guards' | 'sites' | 'attendance' | 'patrols' | 'incidents'

export function WorkspacePage({ route, financeTab = 'overview' }: { route: string; financeTab?: string }) {
  if (route === 'patrols') return <WorkspaceShell active={route}><PatrolsPage /></WorkspaceShell>
  if (['guards', 'sites', 'attendance', 'incidents'].includes(route)) {
    return <WorkspaceShell active={route}><OperationsLivePage section={route as OperationalSection} /></WorkspaceShell>
  }
  if (route === 'overview') return <WorkspaceShell active={route}><OverviewLivePage /></WorkspaceShell>
  if (route === 'alerts') return <WorkspaceShell active={route}><AlertsPage /></WorkspaceShell>
  if (route === 'clients') return <WorkspaceShell active={route}><ClientsPage /></WorkspaceShell>
  if (route === 'finance') return <WorkspaceShell active={route}>{financeTab === 'payroll' ? <FinancePage tab="payroll" /> : <FinanceDataPage tab={financeTab} />}</WorkspaceShell>
  if (route === 'reports') return <WorkspaceShell active={route}><ReportsPage /></WorkspaceShell>
  if (route === 'settings') return <WorkspaceShell active="Settings"><SettingsPage /></WorkspaceShell>
  if (route === 'profile') return <WorkspaceShell active={route}><ProfilePage /></WorkspaceShell>
  if (route === 'napoleon') return <WorkspaceShell active={route}><NapoleonLivePage /></WorkspaceShell>
  return null
}
