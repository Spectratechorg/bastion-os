import { notFound } from 'next/navigation'
import { WorkspacePage } from '@/components/workspace-pages'
import { requireWorkspace } from '@/lib/session'

const sections = new Set([
  'overview',
  'guards',
  'sites',
  'map',
  'attendance',
  'patrols',
  'incidents',
  'alerts',
  'clients',
  'reports',
  'napoleon',
])

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.has(section)) notFound()
  await requireWorkspace()
  return <WorkspacePage route={section} />
}
