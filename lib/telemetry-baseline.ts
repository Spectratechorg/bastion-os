import recorded from '@/latency-baseline.json'
import { TRACKED_SCREENS, type MetricBudget, type TelemetryBaseline } from '@/lib/telemetry-shared'

/**
 * The latency baseline the dashboard compares against.
 *
 * Screen budgets are targets: screen timings only exist once real browsers report them, so they
 * are set here and refined by hand. Endpoint budgets are measured by
 * `scripts/latency-baseline.ts`, which rewrites `latency-baseline.json`; until that has been run
 * the endpoint numbers below are provisional too.
 */

const screenDefaults: Record<string, MetricBudget> = {
  'screen-load': { p50: 1200, p95: 2500 },
  lcp: { p50: 1500, p95: 2500 },
  inp: { p50: 120, p95: 200 },
  cls: { p50: 0.05, p95: 0.1 },
  ttfb: { p50: 400, p95: 800 },
  'route-transition': { p50: 250, p95: 600 },
}

/** The guard app runs on older phones over mobile data, so it gets a wider budget. */
const screenOverrides: Record<string, Record<string, MetricBudget>> = {
  'guard-app': {
    'screen-load': { p50: 1800, p95: 3500 },
    lcp: { p50: 2000, p95: 3500 },
    ttfb: { p50: 700, p95: 1500 },
    'route-transition': { p50: 350, p95: 800 },
  },
  overview: {
    'screen-load': { p50: 1500, p95: 3000 },
    'route-transition': { p50: 300, p95: 700 },
  },
}

const screens = Object.fromEntries(
  TRACKED_SCREENS.map((screen) => [screen, { ...screenDefaults, ...(screenOverrides[screen] ?? {}) }]),
)

const targetEndpoints: Record<string, MetricBudget> = {
  '/api/dashboard': { p50: 250, p95: 600 },
  '/api/operations': { p50: 200, p95: 500 },
  '/api/patrols': { p50: 200, p95: 500 },
  '/api/guard/scan': { p50: 300, p95: 800 },
  '/api/guard/me': { p50: 100, p95: 300 },
  '/api/guard/access': { p50: 100, p95: 300 },
  '/api/telemetry': { p50: 100, p95: 300 },
}

const measured = recorded as {
  generatedAt: string | null
  environment: string
  endpoints: Record<string, MetricBudget>
}
const hasMeasurement = typeof measured.generatedAt === 'string'

export const TELEMETRY_BASELINE: TelemetryBaseline = {
  version: 1,
  provisional: !hasMeasurement,
  generatedAt: measured.generatedAt,
  environment: hasMeasurement
    ? measured.environment
    : 'Provisional targets. Run `npm run perf:baseline` against a seeded workspace to measure the endpoints.',
  screens,
  endpoints: hasMeasurement ? { ...targetEndpoints, ...measured.endpoints } : targetEndpoints,
}

export function screenBudget(screen: string, metric: string): MetricBudget | null {
  return TELEMETRY_BASELINE.screens[screen]?.[metric] ?? null
}

export function endpointBudget(route: string): MetricBudget | null {
  return TELEMETRY_BASELINE.endpoints[route] ?? null
}
