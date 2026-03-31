/**
 * Koru construction system types.
 * Every curve traces to a numbered circle. Centers snap to the lattice.
 * Allowed ops: place, intersect, subtract, clip, retain arc, discard arc.
 */

export const PHI = (1 + Math.sqrt(5)) / 2

/** Golden-rectangle design zone (width × height). Default 162×100. */
export type Zone = { width: number; height: number }

/** Reflect x across vertical centerline at width/2. */
export function mirrorX(x: number, zoneWidth: number): number {
  return zoneWidth - x
}

/** Named anchor IDs. */
export type AnchorId =
  | 'top-left'
  | 'top-mid'
  | 'top-right'
  | 'mid-left'
  | 'center'
  | 'mid-right'
  | 'bottom-left'
  | 'bottom-mid'
  | 'bottom-right'
  | 'q-tl'
  | 'q-tr'
  | 'q-bl'
  | 'q-br'
  | 'mid-top'
  | 'mid-bottom'

/** Circle IDs in the library. */
export type CircleId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8'

/** Place a circle at an anchor. */
export type PlaceInstruction = {
  op: 'place'
  circle: CircleId
  at: AnchorId
}

/** Retain arc from a placed circle (fromDeg to toDeg, CCW). */
export type RetainArcInstruction = {
  op: 'retainArc'
  circle: CircleId
  at: AnchorId
  fromDeg: number
  toDeg: number
}

/** Discard arc from a placed circle. */
export type DiscardArcInstruction = {
  op: 'discardArc'
  circle: CircleId
  at: AnchorId
  fromDeg: number
  toDeg: number
}

/** Subtract overlap of circle B from circle A. */
export type SubtractInstruction = {
  op: 'subtract'
  from: CircleId
  atFrom: AnchorId
  remove: CircleId
  atRemove: AnchorId
}

/** Intersect two circles. */
export type IntersectInstruction = {
  op: 'intersect'
  a: CircleId
  atA: AnchorId
  b: CircleId
  atB: AnchorId
}

/** Clip to zone bounds. */
export type ClipInstruction = {
  op: 'clip'
  toZone: true
}

export type Instruction =
  | PlaceInstruction
  | RetainArcInstruction
  | DiscardArcInstruction
  | SubtractInstruction
  | IntersectInstruction
  | ClipInstruction

/** Full construction recipe. */
export type Construction = {
  zone: Zone
  circleLibrary: Record<CircleId, number>
  instructions: Instruction[]
}

/** Placed circle with center. */
export type PlacedCircle = {
  id: CircleId
  at: AnchorId
  cx: number
  cy: number
  r: number
}

/** Arc segment (fromDeg to toDeg). */
export type ArcSegment = {
  placed: PlacedCircle
  fromDeg: number
  toDeg: number
}
