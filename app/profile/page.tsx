import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { WorkspaceShell } from '@/components/workspace-shell'
import { PageHeader } from '@/components/workspace-shell'

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  return <WorkspaceShell active="">
    <PageHeader title="Profile" subtitle="Your account details." />
    <section className="max-w-lg rounded-[18px] border border-zinc-200 bg-white p-5 text-sm"><p className="text-xs text-zinc-500">Name</p><p className="font-medium">{session.user.name}</p><p className="mt-4 text-xs text-zinc-500">Email</p><p className="font-medium">{session.user.email}</p></section>
  </WorkspaceShell>
}
