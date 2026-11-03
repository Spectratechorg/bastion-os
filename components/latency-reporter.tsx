'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

import { screenForPath, type TelemetrySampleInput } from '@/lib/telemetry-shared'

const FLUSH_DELAY_MS = 2000
const MAX_BATCH = 20

let queue: TelemetrySampleInput[] = []
let timer: number | null = null

function disabled() {
  if (process.env.NEXT_PUBLIC_TELEMETRY_DISABLED === 'true') return true
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return true
  return false
}

function deviceKind() {
  if (typeof window === 'undefined') return undefined
  if (window.matchMedia('(max-width: 640px)').matches) return 'mobile'
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet'
  return 'desktop'
}

function flush(useBeacon = false) {
  if (timer !== null) { window.clearTimeout(timer); timer = null }
  const samples = queue.splice(0, MAX_BATCH)
  if (samples.length === 0) return
  const body = JSON.stringify({ samples })
  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    // Beacon survives page unload; it cannot read the response, which is fine for telemetry.
    if (navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))) return
  }
  void fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

function enqueue(sample: TelemetrySampleInput) {
  if (disabled()) return
  queue.push(sample)
  if (queue.length >= MAX_BATCH) { flush(); return }
  if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_DELAY_MS)
}

/**
 * Reports real-user latency for the current screen: Core Web Vitals plus a measure of how long
 * each in-app route change takes to paint. Rendered once in the root layout.
 */
export function LatencyReporter() {
  const pathname = usePathname()
  const previous = useRef<{ path: string; at: number } | null>(null)
  const vitalsBound = useRef(false)

  useEffect(() => {
    if (vitalsBound.current) return
    vitalsBound.current = true
    const report = (metric: Metric) => enqueue({
      kind: 'web-vital',
      metric: metric.name.toLowerCase(),
      value: metric.value,
      screen: screenForPath(window.location.pathname),
      rating: metric.rating,
      navigationType: metric.navigationType,
      device: deviceKind(),
    })
    onLCP(report)
    onINP(report)
    onCLS(report)
    onTTFB(report)
    onFCP(report)

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (navigation) {
      enqueue({
        kind: 'screen-load',
        metric: 'screen-load',
        value: Math.max(0, navigation.duration || navigation.loadEventEnd - navigation.startTime),
        screen: screenForPath(window.location.pathname),
        navigationType: navigation.type,
        device: deviceKind(),
      })
    }

    const onHide = () => flush(true)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true) })
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  useEffect(() => {
    const at = performance.now()
    const last = previous.current
    previous.current = { path: pathname, at }
    if (!last || last.path === pathname) return

    // Two frames is the cheapest reliable signal that the new route has been painted.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      enqueue({
        kind: 'route-transition',
        metric: 'route-transition',
        value: Math.max(0, performance.now() - at),
        screen: screenForPath(pathname),
        device: deviceKind(),
      })
    }))
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  return null
}
