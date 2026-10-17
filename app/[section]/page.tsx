import { notFound } from 'next/navigation'
import { WorkspacePage } from '@/components/workspace-pages'

const sections = new Set([
  'overview',
  'guards',
  'sites',
  'attendance',
  'patrols',
  'live-map',
  'incidents',
  'alerts',
  'clients',
  'reports',
  'napoleon',
])

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.has(section)) notFound()
  return <WorkspacePage route={section} />
}
