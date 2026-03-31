/**
 * Golden-ratio construction grid: recursive square subdivision.
 * Subdivides the golden rectangle into largest-possible squares + remaining golden rects.
 * No uniform checkerboard; guide lines come from subdivision boundaries.
 */


export type Rect = { x: number; y: number; w: number; h: number }
export type Point = { x: number; y: number }

export type SquareWithArc = Rect & { arcCorner: 'tl' | 'tr' | 'br' | 'bl' }

/** Subdivide golden rect into squares. Returns squares with arc corner for spiral. */
export function subdivideGoldenRect(
  width: number,
  height: number,
  maxSteps = 8,
  minSize = 1
): { squares: SquareWithArc[]; rects: Rect[] } {
  const squares: SquareWithArc[] = []
  const rects: Rect[] = []
  let x = 0
  let y = 0
  let w = width
  let h = height

  for (let step = 0; step < maxSteps; step++) {
    if (w < minSize || h < minSize) break
    const s = Math.min(w, h)
    const arcCorner = w > h ? 'tr' : 'bl'
    squares.push({ x, y, w: s, h: s, arcCorner })
    if (w > h) {
      x += s
      w -= s
    } else {
      y += s
      h -= s
    }
    if (w > 0 && h > 0) rects.push({ x, y, w, h })
  }
  return { squares, rects }
}

/** All construction snap points: square corners, centers, rect corners, arc junctions. */
export function getConstructionSnapPoints(
  width: number,
  height: number,
  maxSteps = 8
): Point[] {
  const { squares } = subdivideGoldenRect(width, height, maxSteps)
  const pts = new Map<string, Point>()
  const add = (px: number, py: number) => {
    const key = `${px.toFixed(4)}_${py.toFixed(4)}`
    pts.set(key, { x: px, y: py })
  }

  for (const sq of squares) {
    add(sq.x, sq.y)
    add(sq.x + sq.w / 2, sq.y)
    add(sq.x + sq.w, sq.y)
    add(sq.x + sq.w, sq.y + sq.h / 2)
    add(sq.x + sq.w, sq.y + sq.h)
    add(sq.x + sq.w / 2, sq.y + sq.h)
    add(sq.x, sq.y + sq.h)
    add(sq.x, sq.y + sq.h / 2)
  }

  return Array.from(pts.values())
}
