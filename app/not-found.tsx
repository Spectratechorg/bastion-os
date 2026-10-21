import Link from 'next/link'

export default function NotFound() {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F5F6] p-6 text-center text-[#18181B]"><h1 className="text-2xl">Page not found</h1><Link href="/overview" className="inline-flex h-11 items-center rounded-[10px] bg-[#2A2B2E] px-4 text-sm font-semibold text-white">Back to overview</Link></main>
}
