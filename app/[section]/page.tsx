import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { OperationsWorkspace } from '@/components/operations-workspace'

const sections = new Set(['guards', 'sites', 'attendance', 'patrols', 'live-map', 'incidents', 'alerts', 'finances'])
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const { section } = await params
  if (!sections.has(section)) redirect('/')
  return <OperationsWorkspace section={section} />
}
