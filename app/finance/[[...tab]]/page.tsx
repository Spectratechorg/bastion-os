import { notFound } from 'next/navigation'
import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

const tabs = new Set(['overview', 'payroll'])

export default async function FinanceRoute({ params }: { params: Promise<{ tab?: string[] }> }) {
  const { tab } = await params
  const financeTab = tab?.[0] ?? 'overview'
  if (tab && tab.length !== 1 || !tabs.has(financeTab)) notFound()
  await requireWorkspace()
  return <WorkspacePage route="finance" financeTab={financeTab} />
}
