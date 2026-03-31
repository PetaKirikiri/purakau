/**
 * Jigsaw boundary math: male connectors and female receptors as exact inverses.
 * Guarantees zero empty pixels when male and female meet—the boundary is identical,
 * with fill on opposite sides.
 *
 * MATH:
 * - Boundary line at x = lineX. Male bulges one side, female the other.
 * - Reflection across line: x' = 2*lineX - x. Female = reflected male.
 * - Cubic Bezier C(c1x,c1y c2x,c2y ex,ey): inverse = C(2L-c1x,c1y 2L-c2x,c2y 2L-ex,ey).
 * - Endpoints on the line (ex=lineX) stay fixed: 2*lineX - lineX = lineX. No gap.
 * - Both shapes share the exact same boundary curve; fill direction differs.
 */

/** Reflect x across vertical line at lineX. Female control = reflect(male control). */
export function reflectX(x: number, lineX: number): number {
  return 2 * lineX - x
}

/** Inverse of a cubic Bezier C command. Returns female path from male path. */
export function inverseCubicBezier(
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  ex: number,
  ey: number,
  lineX: number
): string {
  const c1x_ = reflectX(c1x, lineX)
  const c2x_ = reflectX(c2x, lineX)
  const ex_ = reflectX(ex, lineX)
  return `C ${c1x_} ${c1y} ${c2x_} ${c2y} ${ex_} ${ey}`
}

/** Parse "C c1x c1y c2x c2y ex ey" and return inverse. Handles multiple C commands. */
export function inverseSvgSegment(segment: string, lineX: number): string {
  const cRegex = /C\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/g
  return segment.replace(cRegex, (_, c1x, c1y, c2x, c2y, ex, ey) =>
    inverseCubicBezier(Number(c1x), Number(c1y), Number(c2x), Number(c2y), Number(ex), Number(ey), lineX)
  )
}

/**
 * Bulge direction for male: outward from rod. Female = inverse (opposite bulgeDir).
 * At lineX: male bulgeDir 1 => c = lineX + k. Female => c = lineX - k = reflectX(lineX + k, lineX).
 * So female uses bulgeDir -1. The math evens out: male + female share boundary, zero gap.
 */
export type BulgeDir = 1 | -1

/** Female bulgeDir is the inverse of male. Ensures male+female share boundary, zero gap. */
export function inverseBulgeDir(dir: BulgeDir): BulgeDir {
  return dir === 1 ? -1 : 1
}

/**
 * Given male SVG path segment, produce female (cookie-cutter inverse).
 * Use when generating connector paths from a single source. The maths even out:
 * male_c + female_c = 2*lineX => they meet exactly on the boundary line.
 */
export function maleToFemaleSegment(maleSegment: string, lineX: number): string {
  return inverseSvgSegment(maleSegment, lineX)
}
