/**
 * Circle library: radii in golden-ratio progression.
 * c1 = base, c2 = c1 * φ, c3 = c2 * φ, etc.
 * Base chosen so largest circle fits within zone.
 */

import { PHI } from './types'
import type { CircleId } from './types'

/** Generate circle library for zone size. 8 circles, largest ~zoneSize/2. */
export function buildCircleLibrary(zoneSize: number, count = 8): Record<CircleId, number> {
  const ids: CircleId[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
  const maxR = zoneSize / 2
  const n = Math.min(count, ids.length)
  const baseR = maxR / Math.pow(PHI, n - 1)

  const lib: Partial<Record<CircleId, number>> = {}
  for (let i = 0; i < n; i++) {
    lib[ids[i]] = baseR * Math.pow(PHI, i)
  }
  return lib as Record<CircleId, number>
}

/** Default library for 100x100 zone. */
export const DEFAULT_LIBRARY: Record<CircleId, number> = buildCircleLibrary(100)
