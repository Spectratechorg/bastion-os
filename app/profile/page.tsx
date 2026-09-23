import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  return <main className="min-h-screen bg-[#f6f8f7] p-6 text-[#18352f] lg:p-10"><div className="mx-auto max-w-2xl"><a href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-[#71847e]">← Back to overview</a><section className="mt-8 rounded-2xl border border-[#dce6e1] bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#df7b48]">Moderator profile</p><h1 className="mt-2 text-2xl font-semibold">{session.user.name}</h1><p className="mt-1 text-sm text-[#71817c]">{session.user.email}</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-[#f4f8f5] p-4"><p className="text-xs text-[#71817c]">Role</p><p className="mt-1 font-semibold">Moderator</p></div><div className="rounded-xl bg-[#f4f8f5] p-4"><p className="text-xs text-[#71817c]">Workspace</p><p className="mt-1 font-semibold">Private BastionOS operations</p></div></div><div className="mt-8 rounded-xl border border-dashed border-[#cddbd4] p-5"><p className="font-semibold">Profile picture</p><p className="mt-1 text-sm text-[#71817c]">Picture uploads can be connected to Blob storage when you are ready to enable managed media storage.</p></div></section></div></main>
}
