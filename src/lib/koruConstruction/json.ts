/**
 * JSON serialization for construction recipes.
 * Output JSON first, then build SVG from that JSON.
 */

import { executeConstruction } from './builder'
import type { Construction, Instruction } from './types'

/** Serialize construction to JSON. */
export function constructionToJson(construction: Construction): string {
  return JSON.stringify(construction, null, 2)
}

/** Parse construction from JSON. */
export function constructionFromJson(json: string): Construction {
  const raw = JSON.parse(json) as unknown
  return validateConstruction(raw)
}

function validateConstruction(raw: unknown): Construction {
  if (typeof raw !== 'object' || raw == null) throw new Error('Invalid construction')
  const o = raw as Record<string, unknown>
  const zone = o.zone as { width?: number; height?: number }
  if (!zone || typeof zone.width !== 'number' || typeof zone.height !== 'number')
    throw new Error('Missing zone.width or zone.height')
  const circleLibrary = o.circleLibrary as Record<string, number>
  if (!circleLibrary || typeof circleLibrary !== 'object') throw new Error('Missing circleLibrary')
  const instructions = o.instructions as Instruction[]
  if (!Array.isArray(instructions)) throw new Error('Missing instructions')
  return { zone: { width: zone.width, height: zone.height }, circleLibrary, instructions }
}

/** Full output: JSON construction + SVG path + metadata. */
export function constructionToFullOutput(construction: Construction): string {
  const { pathD, metadata } = executeConstruction(construction)
  return JSON.stringify(
    {
      construction: {
        zone: construction.zone,
        circleLibrary: construction.circleLibrary,
        instructions: construction.instructions,
      },
      output: {
        pathD,
        zoneWidth: metadata.zoneWidth,
        zoneHeight: metadata.zoneHeight,
        placed: metadata.placed,
        segments: metadata.segments,
      },
    },
    null,
    2
  )
}
