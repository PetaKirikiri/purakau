/**
 * Male/female complement. Given male config, derive the complementary female.
 * Female is the inverse—same boundary, opposite fill. No extra calculation needed:
 * the shape type and math are shared; only gender (bulge direction) flips.
 */

import type { ConnectorShapeConfig, ConnectorGender } from '../db/schema'

/** Complementary gender: male ↔ female. None stays none. */
export function complementaryGender(g: ConnectorGender): ConnectorGender {
  return g === 'male' ? 'female' : g === 'female' ? 'male' : 'none'
}

/** Given male config, return the complementary female config (same type, opposite gender). */
export function toFemaleConfig(maleConfig: ConnectorShapeConfig): ConnectorShapeConfig {
  return { ...maleConfig, gender: complementaryGender((maleConfig.gender ?? 'male') as ConnectorGender) }
}

/** Given female config, return the complementary male config. */
export function toMaleConfig(femaleConfig: ConnectorShapeConfig): ConnectorShapeConfig {
  return { ...femaleConfig, gender: complementaryGender((femaleConfig.gender ?? 'female') as ConnectorGender) }
}

/** Given one meeting-end config, return the pair { left, right } for interlock. Left male ⇒ right female. */
export function getMeetingPair(
  leftConfig: ConnectorShapeConfig
): { left: ConnectorShapeConfig; right: ConnectorShapeConfig } {
  const g = (leftConfig.gender ?? 'male') as ConnectorGender
  if (g === 'none') {
    return { left: { ...leftConfig, gender: 'none' }, right: { ...leftConfig, gender: 'none' } }
  }
  return {
    left: { ...leftConfig, gender: g },
    right: { ...leftConfig, gender: complementaryGender(g) },
  }
}
