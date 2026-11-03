/**
 * Telemetry vocabulary shared by the browser reporter, the ingest route and the dashboard.
 * Nothing here may import server-only modules: the reporter ships this to the client.
 */

export const SAMPLE_KINDS = ['web-vital', 'route-transition', 'screen-load', 'api'] as const
export type SampleKind = (typeof SAMPLE_KINDS)[number]

/** Screens we deliberately track. Anything else is reported under `other`. */
export const TRACKED_SCREENS = [
  'overview',
  'guards',
  'sites',
  'attendance',
  'patrols',
  'incidents',
  'alerts',
  'clients',
  'finance',
  'reports',
  'performance',
  'settings',
  'profile',
  'guard-app',
] as const
export type TrackedScreen = (typeof TRACKED_SCREENS)[number]

const routeToScreen: [string, TrackedScreen][] = [
  ['/overview', 'overview'],
  ['/guards', 'guards'],
  ['/sites', 'sites'],
  ['/attendance', 'attendance'],
  ['/patrols', 'patrols'],
  ['/incidents', 'incidents'],
  ['/alerts', 'alerts'],
  ['/clients', 'clients'],
  ['/finance', 'finance'],
  ['/reports', 'reports'],
  ['/performance', 'performance'],
  ['/settings', 'settings'],
  ['/profile', 'profile'],
  ['/guard-app', 'guard-app'],
]

/** Maps a pathname to the screen name the dashboard groups by. */
export function screenForPath(pathname: string): TrackedScreen | 'other' {
  const match = routeToScreen.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : 'other'
}

export type TelemetrySampleInput = {
  kind: SampleKind
  metric: string
  value: number
  screen?: string
  route?: string
  rating?: string
  device?: string
  navigationType?: string
}

export type MetricBudget = { p50: number; p95: number }

export type TelemetryBaseline = {
  version: number
  provisional: boolean
  generatedAt: string | null
  environment: string
  screens: Record<string, Record<string, MetricBudget>>
  endpoints: Record<string, MetricBudget>
}

export type SummaryRow = {
  /** Screen name or endpoint route. */
  key: string
  metric: string
  count: number
  p50: number
  p95: number
  p99: number
  latest: string | null
  budget: MetricBudget | null
  overBudget: boolean
}

export type TelemetrySummary = {
  window: TelemetryWindow
  since: string
  total: number
  screens: SummaryRow[]
  endpoints: SummaryRow[]
  baseline: { provisional: boolean; generatedAt: string | null; environment: string }
}

export const TELEMETRY_WINDOWS = ['1h', '24h', '7d', '30d'] as const
export type TelemetryWindow = (typeof TELEMETRY_WINDOWS)[number]

export const WINDOW_HOURS: Record<TelemetryWindow, number> = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }

export function isTelemetryWindow(value: unknown): value is TelemetryWindow {
  return typeof value === 'string' && (TELEMETRY_WINDOWS as readonly string[]).includes(value)
}

/** Rounds a millisecond value for display; keeps CLS (unitless) to three decimals. */
export function formatMetric(metric: string, value: number) {
  if (metric === 'cls') return value.toFixed(3)
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

/** Linear-interpolated percentile over an ascending array. Shared so scripts match the server. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)
}

export function metricLabel(metric: string) {
  const labels: Record<string, string> = {
    lcp: 'Largest contentful paint',
    inp: 'Interaction to next paint',
    cls: 'Cumulative layout shift',
    fcp: 'First contentful paint',
    ttfb: 'Time to first byte',
    'screen-load': 'Page load',
    'route-transition': 'Route transition',
    api: 'API response',
  }
  return labels[metric] ?? metric
}
