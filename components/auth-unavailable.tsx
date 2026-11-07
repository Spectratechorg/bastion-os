import Link from 'next/link'
import { Logo } from '@/components/brand'

/** Shown when the auth page cannot reach the database, instead of crashing the render. */
export function AuthUnavailable() {
  return <main className="flex min-h-screen items-center justify-center bg-[#F5F5F6] p-6 text-[#18181B]">
    <section className="w-full max-w-md rounded-[14px] border border-[#E4E4E7] bg-white p-8 text-center">
      <div className="mb-6 flex justify-center"><Logo size={44} /></div>
      <h1 className="text-2xl font-semibold tracking-tight">We can&apos;t reach the database</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#6B6B72]">
        Sign-in is temporarily unavailable. Check the connection settings, then try again.
        If this keeps happening, contact your administrator.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/sign-in" className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#2A2B2E] px-4 text-[12px] font-semibold text-white hover:bg-[#3F4045]">Try again</Link>
      </div>
    </section>
  </main>
}
