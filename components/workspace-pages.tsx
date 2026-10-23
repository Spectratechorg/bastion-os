'use client'

import { WorkspaceShell } from '@/components/workspace-shell'
import { FinanceDataPage } from '@/components/data-pages'
import { ClientsPage } from '@/components/clients-page'
import { NapoleonLivePage } from '@/components/napoleon-live-page'
import { OverviewPage } from '@/components/overview-page'
import { RecordsPage } from '@/components/records-page'
import { PatrolsPage } from '@/components/patrols-page'
import { FinancePage } from '@/components/finance-page'
import { GuardRegisterPage } from '@/components/guard-register-page'
import { MapPage } from '@/components/map-page'
import { ProfilePage } from '@/components/profile-page'
import { ReportsPage, SettingsPage } from '@/components/more-pages'

export function WorkspacePage({ route, financeTab = 'overview' }: { route: string; financeTab?: string }) {
  let content: React.ReactNode; let active = route
  switch (route) {
    case 'overview': content = <OverviewPage />; break
    case 'guards': content = <RecordsPage section="guards" />; break
    case 'guards-new': content = <GuardRegisterPage />; active = 'guards'; break
    case 'map': content = <MapPage />; active = 'Live map'; break
    case 'sites': content = <RecordsPage section="sites" />; break
    case 'attendance': content = <RecordsPage section="attendance" />; break
    case 'incidents': content = <RecordsPage section="incidents" />; break
    case 'alerts': content = <RecordsPage section="alerts" />; break
    case 'patrols': content = <PatrolsPage />; break
    case 'finance': content = financeTab === 'payroll' || financeTab === 'contracts' ? <FinancePage tab={financeTab} /> : <FinanceDataPage tab={financeTab} />; break
    case 'clients': content = <ClientsPage />; break
    case 'reports': content = <ReportsPage />; break
    case 'profile': content = <ProfilePage />; active = 'profile'; break
    case 'napoleon': content = <NapoleonLivePage />; break
    case 'settings': content = <SettingsPage />; active = 'Settings'; break
    default: content = <OverviewPage />
  }
  return <WorkspaceShell active={active}>{content}</WorkspaceShell>
}
