'use client'

import { WorkspaceShell } from '@/components/workspace-shell'
import { NapoleonLivePage } from '@/components/napoleon-live-page'
import { OverviewPage } from '@/components/overview-page'
import { RecordsPage } from '@/components/records-page'
import { PatrolsPage } from '@/components/patrols-page'
import { FinancePage } from '@/components/finance-page'
import { GuardRegisterPage } from '@/components/guard-register-page'
import { ClientsPage, ReportsPage, SettingsPage } from '@/components/more-pages'

export function WorkspacePage({ route, financeTab = 'overview' }: { route: string; financeTab?: string }) {
  let content: React.ReactNode; let active = route
  switch (route) {
    case 'overview': content = <OverviewPage />; break
    case 'guards': content = <RecordsPage section="guards" />; break
    case 'guards-new': content = <GuardRegisterPage />; active = 'guards'; break
    case 'sites': content = <RecordsPage section="sites" />; break
    case 'attendance': content = <RecordsPage section="attendance" />; break
    case 'incidents': content = <RecordsPage section="incidents" />; break
    case 'alerts': content = <RecordsPage section="alerts" />; break
    case 'patrols': content = <PatrolsPage />; break
    case 'finance': content = <FinancePage tab={financeTab === 'payroll' ? 'payroll' : 'overview'} />; break
    case 'clients': content = <ClientsPage />; break
    case 'reports': content = <ReportsPage />; break
    case 'napoleon': content = <NapoleonLivePage />; break
    case 'settings': content = <SettingsPage />; active = 'Settings'; break
    default: content = <OverviewPage />
  }
  return <WorkspaceShell active={active}>{content}</WorkspaceShell>
}
