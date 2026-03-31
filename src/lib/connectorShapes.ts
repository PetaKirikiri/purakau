/**
 * Centralized connector shape logic. Single source of truth for rod endpoint paths.
 * Male/female use jigsawBoundary math: female = reflect(male) across boundary line.
 * Koru uses perfect circles (circleArc) for cookie-cutter S-curve.
 */

import type { ConnectorShapeConfig } from '../db/schema'
import { inverseBulgeDir } from './jigsawBoundary'
import { koruBoundaryArcs, semicircleArc, PHI } from './circleArc'

export const CONNECTOR_SHAPE_TYPES = ['flat', 'round', 'bevel', 'notch', 'arrow', 'koru', 'wave'] as const

/** Single pattern option for now: koru (yin-yang interlock). */
export const CONNECTOR_PATTERN_TYPES = ['koru'] as const

export const DEFAULT_CONFIG: ConnectorShapeConfig = {
  type: 'koru',
  radius: 2,
  inset: 0,
  tipLength: 0,
  tipWidth: 1,
  angle: 45,
  asymmetry: 0,
  notchDepth: 1,
  arcControl: 0.5,
}

/** Single design: right-end connector. Left is derived as inverse. */
export const CONNECTOR_RIGHT_CONFIG: ConnectorShapeConfig = {
  ...DEFAULT_CONFIG,
  type: 'koru',
}

/** Returns config for left end (inverse of right). */
export function invertConnectorConfig(config: ConnectorShapeConfig): ConnectorShapeConfig {
  const a = config.asymmetry ?? 0
  return { ...config, asymmetry: -a }
}

export type ConnectorAt = 'left' | 'right'

export function getConnectorPathD(
  config: ConnectorShapeConfig,
  connectorAt: ConnectorAt,
  dims: { barH: number; barY: number; barW: number; width: number }
): string {
  const { barH, barY, barW, width } = dims
  const type = config.type ?? 'flat'
  const radius = Math.min((config.radius ?? 2), barH / 2)
  const inset = config.inset ?? 0
  const tipLength = config.tipLength ?? 0
  const tipWidth = Math.max(0, Math.min(1, config.tipWidth ?? 1))
  const angle = (config.angle ?? 45) * (Math.PI / 180)
  const asymmetry = Math.max(-1, Math.min(1, config.asymmetry ?? 0))
  const notchDepth = config.notchDepth ?? 1
  const arcControl = Math.max(0.1, Math.min(1, config.arcControl ?? 0.5))

  const x0 = connectorAt === 'left' ? width - barW : 0
  const x1 = connectorAt === 'left' ? width : barW
  const tipX = connectorAt === 'right' ? x1 + tipLength : x0 - tipLength
  const midY = barY + barH / 2
  const tipTop = midY - (barH / 2) * tipWidth - (asymmetry * barH) / 2
  const tipBot = midY + (barH / 2) * tipWidth + (asymmetry * barH) / 2
  const bevelLen = inset || Math.max(0.1, barH * Math.tan(angle))

  if (type === 'round') {
    const c = arcControl
    const r = radius
    const cxTop = connectorAt === 'right' ? tipX - r * (1 - c) : tipX + r * (1 - c)
    const cxBot = connectorAt === 'right' ? tipX - r * (1 - c) : tipX + r * (1 - c)
    if (connectorAt === 'right') {
      return `M ${x0} ${barY} L ${tipX - r} ${barY} Q ${cxTop} ${barY} ${tipX} ${midY} Q ${cxBot} ${barY + barH} ${tipX - r} ${barY + barH} L ${x0} ${barY + barH} Z`
    }
    return `M ${tipX + r} ${barY} Q ${cxTop} ${barY} ${tipX} ${midY} Q ${cxBot} ${barY + barH} ${tipX + r} ${barY + barH} L ${x1} ${barY + barH} L ${x1} ${barY} Z`
  }
  if (type === 'bevel') {
    const topInset = (bevelLen * (1 - asymmetry)) / 2
    const botInset = (bevelLen * (1 + asymmetry)) / 2
    if (connectorAt === 'right') {
      return `M ${x0} ${barY} L ${tipX - topInset} ${barY} L ${tipX} ${midY} L ${tipX - botInset} ${barY + barH} L ${x0} ${barY + barH} Z`
    }
    return `M ${tipX + topInset} ${barY} L ${tipX} ${midY} L ${tipX + botInset} ${barY + barH} L ${x1} ${barY + barH} L ${x1} ${barY} Z`
  }
  if (type === 'notch') {
    const d = Math.min(notchDepth, barH / 2)
    if (connectorAt === 'right') {
      return `M ${x0} ${barY} L ${tipX - d} ${barY} L ${tipX} ${midY} L ${tipX - d} ${barY + barH} L ${x0} ${barY + barH} Z`
    }
    return `M ${tipX + d} ${barY} L ${tipX} ${midY} L ${tipX + d} ${barY + barH} L ${x1} ${barY + barH} L ${x1} ${barY} Z`
  }
  if (type === 'koru') {
    const k = Math.max(2, radius) * 1.2
    const ext = tipLength !== 0 ? tipLength : k * 0.6
    const kx = connectorAt === 'right' ? x1 + ext : x0 - ext
    if (connectorAt === 'right') {
      return `M ${x0} ${barY} L ${x1} ${barY} C ${kx + k} ${barY + barH * 0.25} ${kx + k * 0.5} ${barY + barH * 0.75} ${x1} ${barY + barH} L ${x0} ${barY + barH} Z`
    }
    return `M ${x1} ${barY} L ${x0} ${barY} L ${x0} ${barY + barH} L ${x1} ${barY + barH} C ${kx - k * 0.5} ${barY + barH * 0.75} ${kx - k} ${barY + barH * 0.25} ${x1} ${barY} Z`
  }
  if (type === 'arrow') {
    const usePoint = tipWidth < 0.05
    if (connectorAt === 'right') {
      return usePoint
        ? `M ${x0} ${barY} L ${tipX} ${midY} L ${x0} ${barY + barH} Z`
        : `M ${x0} ${barY} L ${tipX} ${tipTop} L ${tipX} ${tipBot} L ${x0} ${barY + barH} Z`
    }
    return usePoint
      ? `M ${x1} ${barY} L ${tipX} ${midY} L ${x1} ${barY + barH} Z`
      : `M ${x1} ${barY} L ${tipX} ${tipTop} L ${tipX} ${tipBot} L ${x1} ${barY + barH} Z`
  }
  return connectorAt === 'right'
    ? `M ${x0} ${barY} L ${tipX} ${barY} L ${tipX} ${barY + barH} L ${x0} ${barY + barH} Z`
    : `M ${tipX} ${barY} L ${x1} ${barY} L ${x1} ${barY + barH} L ${tipX} ${barY + barH} Z`
}

/** Shared boundary path from (0, barY) to (0, barY+barH). Bulges right (male on left rod, female on right). Endpoint must be (0, barY+barH). */
function getInterlockBoundarySegment(barY: number, barH: number, config: ConnectorShapeConfig): string {
  const type = config.type ?? 'wave'
  const k = Math.max(barH * 0.5, 4)
  const midY = barY + barH / 2
  if (type === 'wave') {
    const k = Math.max(barH * 0.45, 4)
    return `C ${k} ${barY} ${k} ${midY} 0 ${midY} C ${-k} ${midY} ${-k} ${barY + barH} 0 ${barY + barH}`
  }
  if (type === 'koru') {
    return koruBoundaryArcs(barY, barH)
  }
  if (type === 'flat') {
    return `L 0 ${barY + barH}`
  }
  if (type === 'round') {
    const r = Math.min((config.radius ?? 2) * 2, barH / 2)
    return `Q ${r} ${midY} 0 ${barY + barH}`
  }
  return `C ${k} ${barY} ${k} ${midY} 0 ${midY} C ${-k} ${midY} ${-k} ${barY + barH} 0 ${barY + barH}`
}

/**
 * Returns path d and viewBox for a single underline end, for CSS background-image.
 * Uses centralized boundary logic. viewBox is always 0 0 100 barH for consistency.
 */
export function getUnderlineEndPathD(
  barH: number,
  end: 'left' | 'right',
  config: ConnectorShapeConfig,
  variant: 'left' | 'right'
): string {
  const barY = 0
  const barW = 100
  const bulgeDir: 1 | -1 = variant === 'right' ? 1 : -1
  if (config.gender === 'none') {
    if (end === 'right') return `M 0 0 L 0 ${barH} L ${barW} ${barH} L ${barW} 0 Z`
    return `M 0 0 L ${barW} 0 L ${barW} ${barH} L 0 ${barH} Z`
  }
  if (end === 'right') {
    const boundary = getBoundarySegmentAt(barY, barH, config, 0, bulgeDir)
    return `M 0 0 ${boundary} L ${barW} ${barH} L ${barW} 0 Z`
  }
  const boundary = getBoundarySegmentAt(barY, barH, config, barW, (-bulgeDir) as 1 | -1)
  return `M 0 0 L ${barW} 0 ${boundary} L 0 ${barH} Z`
}

/** Returns left and right path d strings that share the exact same boundary. No gap. */
export function getInterlockPaths(
  dims: { barH: number; barY: number; barW: number },
  config: ConnectorShapeConfig
): { leftPathD: string; rightPathD: string } {
  const { barH, barY, barW } = dims
  const boundary = getInterlockBoundarySegment(barY, barH, config)
  const leftPathD = `M ${-barW} ${barY} L 0 ${barY} ${boundary} L ${-barW} ${barY + barH} Z`
  const rightPathD = `M 0 ${barY} ${boundary} L ${barW} ${barY + barH} L ${barW} ${barY} L 0 ${barY} Z`
  return { leftPathD, rightPathD }
}

/**
 * Boundary segment at x=lineX. bulgeDir: 1 = bulge right (male), -1 = bulge left (female).
 * Uses reflectX: female c = 2*lineX - male_c so male+female share boundary, zero gap.
 */
function getBoundarySegmentAt(
  barY: number,
  barH: number,
  config: ConnectorShapeConfig,
  lineX: number,
  bulgeDir: 1 | -1
): string {
  const midY = barY + barH / 2
  const k = Math.max(barH * 0.45, 4)
  const type = config.type ?? 'flat'
  if (type === 'flat' || config.gender === 'none') return `L ${lineX} ${barY + barH}`
  const cMale = lineX + k * bulgeDir
  const c = cMale
  if (type === 'wave') {
    return `C ${c} ${barY} ${c} ${midY} ${lineX} ${midY} C ${c} ${midY} ${c} ${barY + barH} ${lineX} ${barY + barH}`
  }
  if (type === 'koru') {
    const chord1 = barH / (PHI * PHI)
    const chord2 = barH / PHI
    const koruMidY = barY + chord1
    const r1 = chord1 / 2
    const r2 = chord2 / 2
    return `${semicircleArc(lineX, barY, koruMidY, r1, bulgeDir)} ${semicircleArc(lineX, koruMidY, barY + barH, r2, (-bulgeDir) as 1 | -1)}`
  }
  return `C ${c} ${barY} ${c} ${midY} ${lineX} ${midY} C ${c} ${midY} ${c} ${barY + barH} ${lineX} ${barY + barH}`
}

/** Reverse of boundary segment: from (lineX, barY+barH) to (lineX, barY). Same jigsaw math. */
function getBoundarySegmentAtReverse(
  barY: number,
  barH: number,
  config: ConnectorShapeConfig,
  lineX: number,
  bulgeDir: 1 | -1
): string {
  const midY = barY + barH / 2
  const k = Math.max(barH * 0.45, 4)
  const type = config.type ?? 'flat'
  if (type === 'flat' || config.gender === 'none') return `L ${lineX} ${barY}`
  const c = lineX + k * bulgeDir
  if (type === 'wave') {
    return `C ${c} ${barY + barH} ${c} ${midY} ${lineX} ${midY} C ${c} ${midY} ${c} ${barY} ${lineX} ${barY}`
  }
  if (type === 'koru') {
    const chord1 = barH / (PHI * PHI)
    const chord2 = barH / PHI
    const koruMidY = barY + chord1
    const r1 = chord1 / 2
    const r2 = chord2 / 2
    return `${semicircleArc(lineX, barY + barH, koruMidY, r2, (-bulgeDir) as 1 | -1)} ${semicircleArc(lineX, koruMidY, barY, r1, bulgeDir)}`
  }
  return `C ${c} ${barY + barH} ${c} ${midY} ${lineX} ${midY} C ${c} ${midY} ${c} ${barY} ${lineX} ${barY}`
}

export type InterlockPreviewConfigs = {
  leftPosLeft: ConnectorShapeConfig
  leftPosRight: ConnectorShapeConfig
  rightPosLeft: ConnectorShapeConfig
  rightPosRight: ConnectorShapeConfig
}

/** Resolve bulgeDir from gender. Male=outward, female=inverse (inverseBulgeDir). None=flat. */
function getBulgeDir(config: ConnectorShapeConfig, isLeftEnd: boolean): 1 | -1 | null {
  const g = config.gender ?? 'male'
  if (g === 'none') return null
  const maleDir: 1 | -1 = isLeftEnd ? -1 : 1
  return g === 'male' ? maleDir : inverseBulgeDir(maleDir)
}

/** Full preview with all 4 ends. Uses centralized boundary logic. */
export function getInterlockPreviewPaths(
  dims: { barH: number; barY: number; barW: number },
  configs: InterlockPreviewConfigs
): { leftPathD: string; rightPathD: string } {
  const { barH, barY, barW } = dims
  const leftBulge = getBulgeDir(configs.leftPosLeft, true)
  const rightBulge = getBulgeDir(configs.rightPosRight, false)
  const leftEndUp =
    leftBulge == null
      ? `L ${-barW} ${barY}`
      : getBoundarySegmentAtReverse(barY, barH, configs.leftPosLeft, -barW, leftBulge)
  const meeting = getInterlockBoundarySegment(barY, barH, configs.leftPosRight)
  const rightEndUp =
    rightBulge == null
      ? `L ${barW} ${barY}`
      : getBoundarySegmentAtReverse(barY, barH, configs.rightPosRight, barW, rightBulge)

  const leftPathD = `M ${-barW} ${barY} L 0 ${barY} ${meeting} L ${-barW} ${barY + barH} ${leftEndUp} Z`
  const rightPathD = `M 0 ${barY} ${meeting} L ${barW} ${barY + barH} ${rightEndUp} L ${barW} ${barY} L 0 ${barY} Z`
  return { leftPathD, rightPathD }
}
