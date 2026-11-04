'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F5F6] p-6 text-center text-[#18181B]">
          <h1 className="text-2xl">Something went wrong</h1>
          <p className="max-w-sm text-sm text-zinc-500">The app could not start. Your data is safe. Try again, and contact support if it keeps happening.</p>
          <button onClick={reset} className="h-11 rounded-[10px] bg-[#2A2B2E] px-4 text-sm font-semibold text-white hover:bg-[#3F4045]">Try again</button>
        </main>
      </body>
    </html>
  )
}
