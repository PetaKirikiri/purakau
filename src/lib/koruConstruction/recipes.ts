/**
 * Example koru recipes. JSON-first: build SVG from construction data.
 * Zone is golden rectangle: 162×100.
 */

import { buildCircleLibrary } from './library'
import { executeConstruction } from './builder'
import type { Construction, Instruction } from './types'

const ZONE_WIDTH = 162
const ZONE_HEIGHT = 100

/** Simple koru spiral: nested arcs from center. */
export function koruSpiralRecipe(
  zoneWidth = ZONE_WIDTH,
  zoneHeight = ZONE_HEIGHT
): Construction {
  const library = buildCircleLibrary(zoneHeight)
  const instructions: Instruction[] = [
    { op: 'place', circle: 'c4', at: 'center' },
    { op: 'place', circle: 'c3', at: 'center' },
    { op: 'place', circle: 'c2', at: 'center' },
    { op: 'retainArc', circle: 'c4', at: 'center', fromDeg: 90, toDeg: 270 },
    { op: 'retainArc', circle: 'c3', at: 'center', fromDeg: 180, toDeg: 360 },
    { op: 'retainArc', circle: 'c2', at: 'center', fromDeg: 270, toDeg: 450 },
  ]
  return { zone: { width: zoneWidth, height: zoneHeight }, circleLibrary: library, instructions }
}

/** Koru hook: offset circles with subtract. c5 and c4 overlap. */
export function koruHookRecipe(
  zoneWidth = ZONE_WIDTH,
  zoneHeight = ZONE_HEIGHT
): Construction {
  const library = buildCircleLibrary(zoneHeight)
  const instructions: Instruction[] = [
    { op: 'place', circle: 'c5', at: 'q-tl' },
    { op: 'place', circle: 'c4', at: 'center' },
    { op: 'subtract', from: 'c5', atFrom: 'q-tl', remove: 'c4', atRemove: 'center' },
    { op: 'retainArc', circle: 'c4', at: 'center', fromDeg: 200, toDeg: 340 },
  ]
  return { zone: { width: zoneWidth, height: zoneHeight }, circleLibrary: library, instructions }
}

/** Māori-inspired termination: intersecting circles. */
export function koruTerminationRecipe(
  zoneWidth = ZONE_WIDTH,
  zoneHeight = ZONE_HEIGHT
): Construction {
  const library = buildCircleLibrary(zoneHeight)
  const instructions: Instruction[] = [
    { op: 'place', circle: 'c3', at: 'bottom-mid' },
    { op: 'place', circle: 'c2', at: 'q-bl' },
    { op: 'place', circle: 'c2', at: 'q-br' },
    { op: 'retainArc', circle: 'c3', at: 'bottom-mid', fromDeg: 150, toDeg: 390 },
    { op: 'retainArc', circle: 'c2', at: 'q-bl', fromDeg: 0, toDeg: 180 },
    { op: 'retainArc', circle: 'c2', at: 'q-br', fromDeg: 180, toDeg: 360 },
  ]
  return { zone: { width: zoneWidth, height: zoneHeight }, circleLibrary: library, instructions }
}

/** Build SVG string from construction. */
export function constructionToSvg(
  construction: Construction,
  opts?: { scale?: number; stroke?: string; fill?: string }
): string {
  const { pathD, metadata } = executeConstruction(construction)
  const scale = opts?.scale ?? 1
  const stroke = opts?.stroke ?? 'currentColor'
  const fill = opts?.fill ?? 'none'
  const w = metadata.zoneWidth * scale
  const h = metadata.zoneHeight * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${metadata.zoneWidth} ${metadata.zoneHeight}" width="${w}" height="${h}">
  <path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
</svg>`
}
