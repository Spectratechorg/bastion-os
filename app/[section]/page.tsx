import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

const sections: Record<string, string> = { guards: 'Guard registry', sites: 'Site command', attendance: 'Attendance ledger', 'live-map': 'Live map', incidents: 'Incident queue', alerts: 'Alert center' }
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const { section } = await params
  const title = sections[section]
  if (!title) redirect('/')
  return <main className="min-h-screen bg-[#f6f8f7] p-8 text-[#18352f]"><a href="/" className="text-sm font-semibold text-[#173f37]">← Back to overview</a><div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-[#dbe4e0] bg-white p-10"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#82908d]">BastionOS workspace</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1><p className="mt-4 max-w-xl text-sm leading-6 text-[#71817c]">Your private operations workspace for {session.user.name ?? session.user.email}. Records created here are scoped to your account and stay separate from every other moderator.</p><div className="mt-8 rounded-xl bg-[#eef5f1] p-5 text-sm text-[#48665e]"><span className="font-semibold text-[#315d52]">{title}</span> is ready for live records, filters and actions.</div></div></main>
}
