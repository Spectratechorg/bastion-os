'use client'

import { useEffect, useState } from 'react'

/**
 * Shown while the browser reports no connection. Styled like the app's warning state
 * (same amber as the pending badges) and mounted in the root layout, so it covers the
 * workspace and the guard app alike.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online !== false) return null

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-[#F3E3BF] bg-[#FEF3E2] px-4 py-2 text-center text-[11px] font-semibold text-[#B7791F]">
      <span aria-hidden className="size-1.5 rounded-full bg-[#B7791F]" />
      You are offline. This page stays open, but changes cannot be saved until the connection returns.
    </div>
  )
}
