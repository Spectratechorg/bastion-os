import { percentile } from './telemetry-shared'

/**
 * The fields compared between a real sample and its replayed copy.
 *
 * `organizationId` is deliberately absent: the gateway attributes a replayed request to the
 * operator running the replay, not to the original session. `createdAt` and `id` change by design.
 */
export type ComparableSample = {
  kind: string
  screen: string | null
  route: string | null
  metric: string
  value: number
  rating: string | null
  device: string | null
  navigationType: string | null
}

export type Drift = { source: ComparableSample; replayed: ComparableSample; delta: number }

export type CompareResult = {
  source: number
  replayed: number
  matched: number
  drift: Drift[]
  missing: ComparableSample[]
  extra: ComparableSample[]
  equal: boolean
}

function fingerprint(sample: ComparableSample): string {
  return JSON.stringify([sample.kind, sample.screen, sample.route, sample.metric, sample.value, sample.rating, sample.device, sample.navigationType])
}

/** Same row ignoring the numeric value, used to explain a drift instead of a loss + duplicate. */
function looseKey(sample: ComparableSample): string {
  return JSON.stringify([sample.kind, sample.screen, sample.route, sample.metric, sample.rating, sample.device, sample.navigationType])
}

/**
 * Compares two multisets of samples.
 *
 * Exact matches are counted first. The leftovers are paired by everything except `value`; a pair
 * means the value changed in flight (drift) rather than the row being lost and a new one appearing.
 * Anything still unpaired is a genuine loss or duplicate.
 */
export function compareTelemetry(source: ComparableSample[], replayed: ComparableSample[]): CompareResult {
  // Consume exact matches from a replay-side multiset, in replay order.
  const replayCounts = new Map<string, number>()
  for (const sample of replayed) {
    const key = fingerprint(sample)
    replayCounts.set(key, (replayCounts.get(key) ?? 0) + 1)
  }

  let matched = 0
  const unmatchedSource: ComparableSample[] = []
  for (const sample of source) {
    const key = fingerprint(sample)
    const count = replayCounts.get(key) ?? 0
    if (count > 0) {
      replayCounts.set(key, count - 1)
      matched += 1
    } else {
      unmatchedSource.push(sample)
    }
  }

  const unmatchedReplayed = replayed.filter((sample) => {
    const key = fingerprint(sample)
    const count = replayCounts.get(key) ?? 0
    if (count <= 0) return false
    replayCounts.set(key, count - 1)
    return true
  })

  const extrasByKey = new Map<string, ComparableSample[]>()
  for (const sample of unmatchedReplayed) {
    const key = looseKey(sample)
    const bucket = extrasByKey.get(key) ?? []
    bucket.push(sample)
    extrasByKey.set(key, bucket)
  }

  const drift: Drift[] = []
  const missing: ComparableSample[] = []
  for (const sample of unmatchedSource) {
    const bucket = extrasByKey.get(looseKey(sample))
    if (bucket && bucket.length > 0) {
      const replayedSample = bucket.shift() as ComparableSample
      drift.push({ source: sample, replayed: replayedSample, delta: replayedSample.value - sample.value })
    } else {
      missing.push(sample)
    }
  }

  const extra = [...extrasByKey.values()].flat()

  return {
    source: source.length,
    replayed: replayed.length,
    matched,
    drift,
    missing,
    extra,
    equal: missing.length === 0 && extra.length === 0 && drift.length === 0,
  }
}

export type GroupStats = { key: string; count: number; p50: number; p95: number }

/** Per screen/endpoint statistics, so a whole-group change is visible at a glance. */
export function groupStats(samples: ComparableSample[]): Map<string, GroupStats> {
  const groups = new Map<string, number[]>()
  for (const sample of samples) {
    const key = sample.kind === 'api' ? `api ${sample.route ?? 'unknown'}` : `${sample.screen ?? 'unknown'} ${sample.metric}`
    const values = groups.get(key) ?? []
    values.push(sample.value)
    groups.set(key, values)
  }
  const stats = new Map<string, GroupStats>()
  for (const [key, values] of groups) {
    const sorted = [...values].sort((a, b) => a - b)
    stats.set(key, { key, count: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) })
  }
  return stats
}
