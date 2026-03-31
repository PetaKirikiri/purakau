/**
 * Yin–yang style underline connector: one circle at the join, S-curve divider,
 * complementary halves + straight rod bodies. Mathematically shared boundary (no gap).
 */

export type KoruConnectorParams = {
  /** Parent circle radius at join (compact underline lane) */
  connectorRadius: number
  rodThickness: number
  /** Circle center x = join line between left and right rods */
  joinX: number
  /** Straight rod length on each side (from circle tangent outward) */
  rodExtend: number
  verticalAlign: number
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString()

function arcA(
  rx: number,
  ry: number,
  largeArc: 0 | 1,
  sweep: 0 | 1,
  x: number,
  y: number
): string {
  return `A ${fmt(rx)} ${fmt(ry)} 0 ${largeArc} ${sweep} ${fmt(x)} ${fmt(y)}`
}

/** Rod vertical band */
function rodY(p: KoruConnectorParams): { y0: number; y1: number; cy: number } {
  const { rodThickness: t, verticalAlign: v } = p
  const y0 = -t / 2 + v
  const y1 = t / 2 + v
  return { y0, y1, cy: v }
}

/**
 * pathLeftHalfDiskD = eastern lobe (right of S). pathRightHalfDiskD = western lobe (left of S).
 * (SVG winding meant the old “left” path enclosed the east; even-odd then painted west blue.)
 */
/** Eastern half-disk (right of S-curve). */
export function pathLeftHalfDiskD(cx: number, cy: number, R: number): string {
  return [
    `M ${fmt(cx)} ${fmt(cy - R)}`,
    arcA(R, R, 0, 1, cx, cy + R),
    arcA(R / 2, R / 2, 0, 1, cx, cy),
    arcA(R / 2, R / 2, 0, 0, cx, cy - R),
    'Z',
  ].join(' ')
}

/** Western half-disk (left of S-curve). */
export function pathRightHalfDiskD(cx: number, cy: number, R: number): string {
  return [
    `M ${fmt(cx)} ${fmt(cy - R)}`,
    arcA(R / 2, R / 2, 0, 1, cx, cy),
    arcA(R / 2, R / 2, 0, 0, cx, cy + R),
    arcA(R, R, 0, 0, cx, cy - R),
    'Z',
  ].join(' ')
}

/** Full parent circle (two semicircles) — pairs with pathLeftHalfDiskD for even-odd right clip. */
export function pathFullCircleD(cx: number, cy: number, R: number): string {
  return [
    `M ${fmt(cx)} ${fmt(cy - R)}`,
    arcA(R, R, 0, 1, cx, cy + R),
    arcA(R, R, 0, 1, cx, cy - R),
    'Z',
  ].join(' ')
}

/** Eastern disk clip: even-odd full ⊕ western lobe (must subtract pathRightHalfDiskD). */
export function pathRightDiskClipEvenOddD(cx: number, cy: number, R: number): string {
  return `${pathFullCircleD(cx, cy, R)} ${pathRightHalfDiskD(cx, cy, R)}`
}

/** Open S-curve only (north → south), same curve used on both sides of the boundary. */
export function pathSBoundaryD(cx: number, cy: number, R: number): string {
  return [
    `M ${fmt(cx)} ${fmt(cy - R)}`,
    arcA(R / 2, R / 2, 0, 1, cx, cy),
    arcA(R / 2, R / 2, 0, 0, cx, cy + R),
  ].join(' ')
}

function pathRect(x0: number, y0: number, x1: number, y1: number): string {
  return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)} L ${fmt(x0)} ${fmt(y1)} Z`
}

/** Rod extends slightly past the vertical tangent into the disk so the rect meets the curved boundary (no wedge gap). */
export function rodOverlapIntoDisk(R: number): number {
  return Math.min(2.5, Math.max(0.75, R * 0.12))
}

export function pathLeftRodRectD(p: KoruConnectorParams): string {
  const { connectorRadius: R, joinX: cx, rodExtend: L } = p
  const { y0, y1 } = rodY(p)
  const ov = rodOverlapIntoDisk(R)
  return pathRect(cx - R - L, y0, cx - R + ov, y1)
}

export function pathRightRodRectD(p: KoruConnectorParams): string {
  const { connectorRadius: R, joinX: cx, rodExtend: L } = p
  const { y0, y1 } = rodY(p)
  const ov = rodOverlapIntoDisk(R)
  return pathRect(cx + R - ov, y0, cx + R + L, y1)
}

/** One shared parent disk; two clip regions (union of rod rect + half-disk) for green / blue. */
export function connectorClipPaths(p: KoruConnectorParams): {
  cx: number
  cy: number
  R: number
  leftRodD: string
  leftHalfD: string
  rightRodD: string
  /** even-odd: full ⊕ left half = right half disk (avoids broken pathRightHalfDisk as clip) */
  rightDiskClipEvenOddD: string
  rightHalfD: string
  sBoundaryD: string
} {
  const { connectorRadius: R, joinX: cx, verticalAlign: cy } = p
  return {
    cx,
    cy,
    R,
    leftRodD: pathLeftRodRectD(p),
    leftHalfD: pathRightHalfDiskD(cx, cy, R),
    rightRodD: pathRightRodRectD(p),
    rightDiskClipEvenOddD: pathRightDiskClipEvenOddD(cx, cy, R),
    rightHalfD: pathRightHalfDiskD(cx, cy, R),
    sBoundaryD: pathSBoundaryD(cx, cy, R),
  }
}

/** Legacy combined paths (debug / export) */
export function buildMalePathD(p: KoruConnectorParams): string {
  const { joinX: cx, connectorRadius: R } = p
  const cy = p.verticalAlign
  return `${pathLeftRodRectD(p)} ${pathRightHalfDiskD(cx, cy, R)}`
}

export function buildFemalePathD(p: KoruConnectorParams): string {
  const { joinX: cx, connectorRadius: R } = p
  const cy = p.verticalAlign
  return `${pathRightRodRectD(p)} ${pathLeftHalfDiskD(cx, cy, R)}`
}

export function joinLineX(p: KoruConnectorParams): number {
  return p.joinX
}

export function boundsYinYang(p: KoruConnectorParams, pad = 14): {
  minX: number
  minY: number
  width: number
  height: number
} {
  const { connectorRadius: R, joinX: cx, rodExtend: L, rodThickness: t, verticalAlign: v } = p
  const y0 = -t / 2 + v
  const y1 = t / 2 + v
  const minX = cx - R - L - pad
  const maxX = cx + R + L + pad
  const minY = Math.min(y0, v - R) - pad
  const maxY = Math.max(y1, v + R) + pad
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** Bounding box for left rod + left disk (split view) */
export function boundsMale(p: KoruConnectorParams, pad = 14) {
  const { connectorRadius: R, joinX: cx, rodExtend: L, rodThickness: t, verticalAlign: v } = p
  const y0 = -t / 2 + v
  const y1 = t / 2 + v
  const minX = cx - R - L - pad
  const maxX = cx + pad
  const minY = Math.min(y0, v - R) - pad
  const maxY = Math.max(y1, v + R) + pad
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** Bounding box for right rod + right disk */
export function boundsFemale(p: KoruConnectorParams, pad = 14) {
  const { connectorRadius: R, joinX: cx, rodExtend: L, rodThickness: t, verticalAlign: v } = p
  const y0 = -t / 2 + v
  const y1 = t / 2 + v
  const minX = cx - pad
  const maxX = cx + R + L + pad
  const minY = Math.min(y0, v - R) - pad
  const maxY = Math.max(y1, v + R) + pad
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}
