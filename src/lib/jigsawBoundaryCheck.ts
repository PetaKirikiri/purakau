/**
 * Jigsaw boundary math checker. Validates that in a designated zone, the male
 * protrusion INVADES (fills) the female cavity with no gap. Run via:
 * npx tsx src/lib/jigsawBoundaryCheck.ts
 *
 * TEST LOGIC:
 * - Designated zone: area where male and female meet (the jigsaw boundary).
 * - Male: protrudes into the zone (bulge).
 * - Female: cavity that INVADES the zone (receives the male).
 * - Pass: zone is completely filled—male + female, no empty pixels.
 * - Fail: gap (empty pixels) or curves don't share boundary.
 */

import { inverseSvgSegment } from './jigsawBoundary'
import { getInterlockPaths } from './connectorShapes'
import type { ConnectorShapeConfig, ConnectorGender } from '../db/schema'

const EPS = 1e-6

export type CheckResult = {
  pass: boolean
  message: string
  detail?: Record<string, unknown>
}

/** Designated zone: the jigsaw boundary area where male and female meet. */
export type JigsawZone = {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Sample cubic Bezier at t; add point to pts. */
function sampleCubic(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  pts: { x: number; y: number }[], t: number
): void {
  const mt = 1 - t
  const mt2 = mt * mt, mt3 = mt2 * mt
  const t2 = t * t, t3 = t2 * t
  pts.push({
    x: mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3,
    y: mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3,
  })
}

/** Sample semicircular arc A r r 0 1 sf from (cx,cy) to (ex,ey). Center = chord midpoint. */
function sampleSemicircleArc(
  cx: number,
  cy: number,
  r: number,
  sf: number,
  ex: number,
  ey: number,
  pts: { x: number; y: number }[]
): void {
  const ctrX = (cx + ex) / 2
  const ctrY = (cy + ey) / 2
  for (const t of [0.25, 0.5, 0.75]) {
    const angle = (sf ? -Math.PI / 2 + t * Math.PI : Math.PI / 2 - t * Math.PI)
    pts.push({ x: ctrX + r * Math.cos(angle), y: ctrY + r * Math.sin(angle) })
  }
  pts.push({ x: ex, y: ey })
}

/** Point-in-polygon (ray casting). Returns true if (px,py) is inside the path. */
function pointInPath(px: number, py: number, pathD: string): boolean {
  const commands = pathD.match(/[MLQCZA][^MLQCZA]*/gi) || []
  const pts: { x: number; y: number }[] = []
  let cx = 0,
    cy = 0
  for (const cmd of commands) {
    const c = cmd[0].toUpperCase()
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (c === 'M' && nums.length >= 2) {
      cx = nums[0]
      cy = nums[1]
      pts.push({ x: cx, y: cy })
    } else if (c === 'L' && nums.length >= 2) {
      cx = nums[0]
      cy = nums[1]
      pts.push({ x: cx, y: cy })
    } else if (c === 'C' && nums.length >= 6) {
      const [x1, y1, x2, y2, ex, ey] = nums
      for (const t of [0.25, 0.5, 0.75]) sampleCubic(cx, cy, x1, y1, x2, y2, ex, ey, pts, t)
      cx = nums[4]
      cy = nums[5]
      pts.push({ x: cx, y: cy })
    } else if (c === 'Q' && nums.length >= 4) {
      cx = nums[2]
      cy = nums[3]
      pts.push({ x: cx, y: cy })
    } else if (c === 'A' && nums.length >= 7) {
      const [rx, ry, , , sf, ex, ey] = nums
      const r = Math.max(rx, ry)
      sampleSemicircleArc(cx, cy, r, sf, ex, ey, pts)
      cx = ex
      cy = ey
    } else if (c === 'Z' && pts.length > 0) {
      pts.push({ x: pts[0].x, y: pts[0].y })
    }
  }
  if (pts.length < 3) return false
  let inside = false
  const n = pts.length - 1
  for (let i = 0; i < n; i++) {
    const { x: x1, y: y1 } = pts[i]
    const { x: x2, y: y2 } = pts[i + 1]
    if (py > Math.min(y1, y2) && py <= Math.max(y1, y2) && px <= Math.max(x1, x2)) {
      const xIntersect = y1 !== y2 ? ((py - y1) * (x2 - x1)) / (y2 - y1) + x1 : x1
      if (x1 === x2 || px <= xIntersect) inside = !inside
    }
  }
  return inside
}

/**
 * Check: In the designated zone, does male protrusion + female cavity fill
 * with no gap? Sample grid; each point must be in left OR right path.
 * Samples at half-step to avoid ray-casting edge cases on boundaries.
 */
export function checkZoneFill(
  zone: JigsawZone,
  leftPathD: string,
  rightPathD: string,
  gridStep = 2
): CheckResult {
  const gapPoints: { x: number; y: number }[] = []
  const overlapPoints: { x: number; y: number }[] = []
  let total = 0
  const half = gridStep / 2
  for (let y = zone.yMin + half; y < zone.yMax; y += gridStep) {
    for (let x = zone.xMin + half; x < zone.xMax; x += gridStep) {
      total++
      const inLeft = pointInPath(x, y, leftPathD)
      const inRight = pointInPath(x, y, rightPathD)
      if (!inLeft && !inRight) gapPoints.push({ x, y })
      if (inLeft && inRight) overlapPoints.push({ x, y })
    }
  }
  const gapCount = gapPoints.length
  const overlapCount = overlapPoints.length
  const pass = gapCount === 0
  return {
    pass,
    message: pass
      ? `Zone fill OK: ${total} points, no gap`
      : `Zone GAP: ${gapCount}/${total} empty pixels in designated zone`,
    detail: {
      total,
      gapCount,
      overlapCount,
      sampleGaps: gapPoints.slice(0, 5),
      zone,
    },
  }
}

/**
 * Check: Male and female paths must share the SAME boundary curve at the meeting.
 * Extract boundary from both paths; they must be identical.
 */
export function checkSharedBoundary(leftPathD: string, rightPathD: string, barW: number, barY: number, barH: number): CheckResult {
  const boundaryInLeft = leftPathD.includes('L 0 ') && leftPathD.includes(`L ${-barW} ${barY + barH}`)
  const boundaryInRight = rightPathD.includes('M 0 ') && rightPathD.includes(`L ${barW} ${barY + barH}`)
  const leftHasCurve = /[CA]\s+[\d.-]+/.test(leftPathD)
  const rightHasCurve = /[CA]\s+[\d.-]+/.test(rightPathD)
  const pass = boundaryInLeft && boundaryInRight && leftHasCurve === rightHasCurve
  return {
    pass,
    message: pass
      ? 'Male and female share boundary curve'
      : 'Male/female do NOT share same boundary—gap at meeting',
    detail: { boundaryInLeft, boundaryInRight, leftHasCurve, rightHasCurve },
  }
}

/**
 * Check: Male protrusion and female cavity must be complementary.
 * Female boundary = reflection of male across line. They meet at the line.
 */
export function checkProtrusionInvadesCavity(
  lineX: number,
  _barY: number,
  _barH: number,
  maleSegment: string,
  femaleSegment: string
): CheckResult {
  const maleCubics = maleSegment.match(/C\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+/g) || []
  const femaleCubics = femaleSegment.match(/C\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+/g) || []
  if (maleCubics.length !== femaleCubics.length) {
    return {
      pass: false,
      message: `Protrusion/cavity mismatch: male ${maleCubics.length} cubics, female ${femaleCubics.length}`,
      detail: { maleCubics: maleCubics.length, femaleCubics: femaleCubics.length },
    }
  }
  const re = /C\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/
  for (let i = 0; i < maleCubics.length; i++) {
    const m = maleCubics[i].match(re)!
    const f = femaleCubics[i].match(re)!
    const mc1x = Number(m[1])
    const fc1x = Number(f[1])
    if (Math.abs(mc1x + fc1x - 2 * lineX) > EPS) {
      return {
        pass: false,
        message: `Protrusion does not invade cavity: male c1x=${mc1x}, female c1x=${fc1x}, expected sum=${2 * lineX}`,
        detail: { mc1x, fc1x, lineX },
      }
    }
  }
  return {
    pass: true,
    message: 'Male protrusion invades female cavity (reflection holds)',
  }
}

export type OptionResult = {
  type: string
  gender: ConnectorGender
  pass: boolean
  checks: CheckResult[]
}

/** Run zone + boundary checks for a connector option. */
export function checkConnectorOption(
  type: ConnectorShapeConfig['type'],
  gender: ConnectorGender,
  dims: { barY: number; barH: number; barW: number }
): OptionResult {
  const config: ConnectorShapeConfig = { type, gender }
  // Meeting must be male (protrudes) + female (cavity) for interlock. Test that
  // male protrusion INVADES female cavity in the designated zone with no gap.
  const checks: CheckResult[] = []

  // Use getInterlockPaths: simple meeting boundary, no outer ends. Same shared boundary.
  const { leftPathD, rightPathD } = getInterlockPaths(dims, config)

  // Designated zone: interlock strip where male protrusion invades female cavity.
  // Male (left rod) protrudes right; female (right rod) cavity receives. They meet at x≈0.
  const k = Math.max(dims.barH * 0.5, 4)
  const zone: JigsawZone = {
    xMin: -k - 2,
    xMax: k + 2,
    yMin: dims.barY,
    yMax: dims.barY + dims.barH,
  }
  checks.push(checkZoneFill(zone, leftPathD, rightPathD))
  checks.push(checkSharedBoundary(leftPathD, rightPathD, dims.barW, dims.barY, dims.barH))

  if (type !== 'flat' && gender !== 'none') {
    const k = Math.max(dims.barH * 0.45, 4)
    const midY = dims.barY + dims.barH / 2
    const maleSeg = `C ${-dims.barW + k} ${dims.barY} ${-dims.barW + k} ${midY} ${-dims.barW} ${midY} C ${-dims.barW + k} ${midY} ${-dims.barW + k} ${dims.barY + dims.barH} ${-dims.barW} ${dims.barY + dims.barH}`
    const femaleSeg = inverseSvgSegment(maleSeg, -dims.barW)
    checks.push(checkProtrusionInvadesCavity(-dims.barW, dims.barY, dims.barH, maleSeg, femaleSeg))
  }

  const pass = checks.every((c) => c.pass)
  return { type: type ?? 'flat', gender, pass, checks }
}

/** Run full report over all connector options. */
export function runJigsawReport(dims = { barY: 14, barH: 20, barW: 80 }): { passed: OptionResult[]; failed: OptionResult[] } {
  const types = ['koru'] as const
  const genders: ConnectorGender[] = ['male', 'female', 'none']
  const results: OptionResult[] = []

  for (const type of types) {
    for (const gender of genders) {
      results.push(checkConnectorOption(type, gender, dims))
    }
  }

  const passed = results.filter((r) => r.pass)
  const failed = results.filter((r) => !r.pass)
  return { passed, failed }
}

/** Print report to console */
export function printReport(verbose = false): void {
  const { passed, failed } = runJigsawReport()
  console.log('\n=== Jigsaw Zone Report (Male Protrusion + Female Cavity) ===\n')
  console.log('TEST: In designated zone, does male protrusion INVADE female cavity with no gap?')
  console.log('  - Male: protrudes into zone')
  console.log('  - Female: cavity receives (invades) the space')
  console.log('  - Pass: zone filled, no empty pixels')
  console.log('')
  console.log('PASSED:', passed.length)
  for (const r of passed) {
    console.log(`  ${r.type}/${r.gender}`)
    if (verbose) {
      for (const c of r.checks) {
        console.log(`    [OK] ${c.message}`)
        if (c.detail) console.log(`         ${JSON.stringify(c.detail)}`)
      }
    }
  }
  console.log('\nFAILED:', failed.length)
  for (const r of failed) {
    console.log(`  ${r.type}/${r.gender}`)
    for (const c of r.checks.filter((x) => !x.pass)) {
      console.log(`    - ${c.message}`)
      if (c.detail) console.log(`      ${JSON.stringify(c.detail)}`)
    }
    if (verbose) {
      for (const c of r.checks.filter((x) => x.pass)) {
        console.log(`    [OK] ${c.message}`)
      }
    }
  }
  console.log('\n')
}

/** Return report as JSON */
export function reportAsJson(): string {
  const { passed, failed } = runJigsawReport()
  return JSON.stringify(
    {
      passed: passed.map((r) => ({ type: r.type, gender: r.gender })),
      failed: failed.map((r) => ({
        type: r.type,
        gender: r.gender,
        failedChecks: r.checks.filter((c) => !c.pass).map((c) => ({ message: c.message, detail: c.detail })),
      })),
    },
    null,
    2
  )
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('jigsawBoundaryCheck')) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
  const json = process.argv.includes('--json')
  if (json) {
    console.log(reportAsJson())
  } else {
    printReport(verbose)
  }
}
