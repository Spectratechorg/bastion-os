import { notFound } from 'next/navigation'
import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

const sections = new Set([
  'overview',
  'admin',
  'guards',
  'sites',
  'attendance',
  'patrols',
  'incidents',
  'alerts',
  'clients',
  'reports',
  'napoleon',
  'deepseek',
  'ask-napoleon',
  'ai',
])

export const dynamic = 'force-dynamic'

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.has(section)) notFound()
  await requireWorkspace()
  const route = section === 'deepseek' || section === 'ask-napoleon' || section === 'ai' ? 'napoleon' : section
  return <WorkspacePage route={route} />
}
