import { notFound, redirect } from 'next/navigation'
import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'
import { FINANCE_ENABLED } from '@/lib/features'

const tabs = new Set(['overview', 'invoices', 'expenses', 'contracts', 'inventory', 'budgets', 'payroll'])

export default async function FinanceRoute({ params }: { params: Promise<{ tab?: string[] }> }) {
  // Finance returns in V2; the page and API stay in the codebase.
  if (!FINANCE_ENABLED) redirect('/overview')
  const { tab } = await params
  const financeTab = tab?.[0] ?? 'overview'
  if (tab && tab.length !== 1 || !tabs.has(financeTab)) notFound()
  await requireWorkspace()
  return <WorkspacePage route="finance" financeTab={financeTab} />
}
