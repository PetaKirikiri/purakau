/**
 * Build instruction executor. Produces SVG path from construction recipe.
 * All curves are circle arcs from the approved library.
 */

import { getAnchorPosition } from './anchors'
import type {
  Construction,
  PlacedCircle,
  ArcSegment,
  CircleId,
  AnchorId,
} from './types'

const DEG = Math.PI / 180

/** Resolve placed circle from library and anchor. */
function resolvePlaced(
  circleId: CircleId,
  at: AnchorId,
  library: Record<CircleId, number>,
  zoneWidth: number,
  zoneHeight: number
): PlacedCircle {
  const pos = getAnchorPosition(at, zoneWidth, zoneHeight)
  return {
    id: circleId,
    at,
    cx: pos.x,
    cy: pos.y,
    r: library[circleId],
  }
}

/** Arc endpoint from center, radius, degrees. SVG: 0°=right, 90°=down. */
function arcPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = deg * DEG
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** SVG arc: (sx,sy) to (ex,ey), radius r. laf=1 if span>180°, sf=1 for CCW. */
function svgArc(_sx: number, _sy: number, ex: number, ey: number, r: number, spanDeg: number): string {
  const laf = spanDeg > 180 ? 1 : 0
  const sf = 1
  return `A ${r} ${r} 0 ${laf} ${sf} ${ex} ${ey}`
}

/** Single arc segment to path. */
function arcSegmentToPath(placed: PlacedCircle, fromDeg: number, toDeg: number): string {
  const { cx, cy, r } = placed
  let span = ((toDeg - fromDeg) % 360 + 360) % 360
  if (span < 0.1) return ''
  const parts: string[] = []
  if (span > 359) {
    const mid = fromDeg + 180
    const start = arcPoint(cx, cy, r, fromDeg)
    const midPt = arcPoint(cx, cy, r, mid)
    const end = arcPoint(cx, cy, r, fromDeg + 360)
    parts.push(`M ${start.x} ${start.y} ${svgArc(start.x, start.y, midPt.x, midPt.y, r, 180)}`)
    parts.push(svgArc(midPt.x, midPt.y, end.x, end.y, r, 180))
  } else {
    const start = arcPoint(cx, cy, r, fromDeg)
    const end = arcPoint(cx, cy, r, toDeg)
    parts.push(`M ${start.x} ${start.y} ${svgArc(start.x, start.y, end.x, end.y, r, span)}`)
  }
  return parts.join(' ')
}

/** Execute construction, return SVG path and metadata. */
export function executeConstruction(
  construction: Construction
): { pathD: string; metadata: ConstructionMetadata } {
  const { zone, circleLibrary, instructions } = construction
  const { width: zoneWidth, height: zoneHeight } = zone
  const placed = new Map<string, PlacedCircle>()
  const segments: ArcSegment[] = []

  for (const inst of instructions) {
    if (inst.op === 'place') {
      const p = resolvePlaced(inst.circle, inst.at, circleLibrary, zoneWidth, zoneHeight)
      placed.set(`${inst.circle}:${inst.at}`, p)
    } else if (inst.op === 'retainArc') {
      const key = `${inst.circle}:${inst.at}`
      const p = placed.get(key)
      if (p) segments.push({ placed: p, fromDeg: inst.fromDeg, toDeg: inst.toDeg })
    } else if (inst.op === 'subtract') {
      const fromKey = `${inst.from}:${inst.atFrom}`
      const removeKey = `${inst.remove}:${inst.atRemove}`
      const a = placed.get(fromKey)
      const b = placed.get(removeKey)
      if (a && b) {
        const arcs = circleSubtract(a, b)
        segments.push(...arcs)
      }
    } else if (inst.op === 'intersect') {
      const aKey = `${inst.a}:${inst.atA}`
      const bKey = `${inst.b}:${inst.atB}`
      const a = placed.get(aKey)
      const b = placed.get(bKey)
      if (a && b) {
        const arcs = circleIntersect(a, b)
        segments.push(...arcs)
      }
    }
  }

  const pathD = segmentsToPath(segments, zoneWidth, zoneHeight, instructions.some((i) => i.op === 'clip'))
  const metadata: ConstructionMetadata = {
    zoneWidth,
    zoneHeight,
    circleLibrary: { ...circleLibrary },
    placed: Array.from(placed.values()),
    segments,
  }
  return { pathD, metadata }
}

/** Circle A minus circle B: arc of A outside B. */
function circleSubtract(a: PlacedCircle, b: PlacedCircle): ArcSegment[] {
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy)
  if (d >= a.r + b.r) return [{ placed: a, fromDeg: 0, toDeg: 360 }]
  if (d <= Math.abs(b.r - a.r) && b.r >= a.r) return []
  const [i1, i2] = circleIntersectionAngles(a, b)
  if (i1 == null || i2 == null) return [{ placed: a, fromDeg: 0, toDeg: 360 }]
  const mid = (i1 + i2) / 2
  const midPt = arcPoint(a.cx, a.cy, a.r, mid)
  const arcInsideB = pointInCircle(midPt.x, midPt.y, b)
  if (arcInsideB) return [{ placed: a, fromDeg: i2, toDeg: i1 + 360 }]
  return [{ placed: a, fromDeg: i1, toDeg: i2 }]
}

/** Circle A intersect B: arc of A inside B. */
function circleIntersect(a: PlacedCircle, b: PlacedCircle): ArcSegment[] {
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy)
  if (d >= a.r + b.r || d <= Math.abs(b.r - a.r)) return []
  const [i1, i2] = circleIntersectionAngles(a, b)
  if (i1 == null || i2 == null) return []
  const mid = (i1 + i2) / 2
  const midPt = arcPoint(a.cx, a.cy, a.r, mid)
  const arcInsideB = pointInCircle(midPt.x, midPt.y, b)
  if (arcInsideB) return [{ placed: a, fromDeg: i1, toDeg: i2 }]
  return [{ placed: a, fromDeg: i2, toDeg: i1 + 360 }]
}

/** Angles on circle A where A and B intersect. */
function circleIntersectionAngles(
  a: PlacedCircle,
  b: PlacedCircle
): [number | null, number | null] {
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy)
  if (d > a.r + b.r || d < Math.abs(a.r - b.r) || d === 0) return [null, null]
  const k = (a.r * a.r - b.r * b.r + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, a.r * a.r - k * k))
  const px = a.cx + (k * (b.cx - a.cx)) / d
  const py = a.cy + (k * (b.cy - a.cy)) / d
  const i1x = px + (h * (b.cy - a.cy)) / d
  const i1y = py - (h * (b.cx - a.cx)) / d
  const i2x = px - (h * (b.cy - a.cy)) / d
  const i2y = py + (h * (b.cx - a.cx)) / d
  const ang1 = Math.atan2(i1y - a.cy, i1x - a.cx) / DEG
  const ang2 = Math.atan2(i2y - a.cy, i2x - a.cx) / DEG
  return [ang1, ang2]
}

function pointInCircle(x: number, y: number, c: PlacedCircle): boolean {
  return Math.hypot(x - c.cx, y - c.cy) <= c.r + 1e-6
}

/** Convert segments to single path. */
function segmentsToPath(
  segments: ArcSegment[],
  _zoneWidth: number,
  _zoneHeight: number,
  _clipToZone: boolean
): string {
  const parts: string[] = []
  for (const s of segments) {
    const p = arcSegmentToPath(s.placed, s.fromDeg, s.toDeg)
    if (p) parts.push(p)
  }
  return parts.join(' ')
}

export type ConstructionMetadata = {
  zoneWidth: number
  zoneHeight: number
  circleLibrary: Record<CircleId, number>
  placed: PlacedCircle[]
  segments: ArcSegment[]
}
