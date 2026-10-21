import { WorkspaceShell } from '@/components/workspace-shell'
import { ClientsDataPage, FinanceDataPage, ReportsDataPage, SettingsDataPage } from '@/components/data-pages'
import { NapoleonLivePage } from '@/components/napoleon-live-page'
import { OperationsLivePage, OverviewLivePage } from '@/components/operations-live-pages'
import { OperationsWorkspace } from '@/components/operations-workspace'

type OperationalSection = 'guards' | 'sites' | 'attendance' | 'patrols' | 'incidents'

export function WorkspacePage({ route, financeTab = 'overview' }: { route: string; financeTab?: string }) {
  if (['guards', 'sites', 'attendance', 'patrols', 'incidents'].includes(route)) {
    return <WorkspaceShell active={route}><OperationsLivePage section={route as OperationalSection} /></WorkspaceShell>
  }
  if (['alerts', 'finances', 'live-map'].includes(route)) {
    return <WorkspaceShell active={route}><OperationsWorkspace section={route} /></WorkspaceShell>
  }
  if (route === 'overview') return <WorkspaceShell active={route}><OverviewLivePage /></WorkspaceShell>
  if (route === 'clients') return <WorkspaceShell active={route}><ClientsDataPage /></WorkspaceShell>
  if (route === 'finance') return <WorkspaceShell active={route}><FinanceDataPage tab={financeTab} /></WorkspaceShell>
  if (route === 'reports') return <WorkspaceShell active={route}><ReportsDataPage /></WorkspaceShell>
  if (route === 'settings') return <WorkspaceShell active="Settings"><SettingsDataPage /></WorkspaceShell>
  if (route === 'napoleon') return <WorkspaceShell active={route}><NapoleonLivePage /></WorkspaceShell>
  return null
}
