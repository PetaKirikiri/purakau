/**
 * Anchor lattice: predetermined snap points inside the zone.
 * Circle centers can only be placed at these coordinates.
 * Zone is golden rectangle: width × height (e.g. 162×100).
 */

import type { AnchorId } from './types'

/** Compute anchor (x, y) for zone. Origin top-left, y down. */
export function getAnchorPosition(
  anchorId: AnchorId,
  zoneWidth: number,
  zoneHeight: number
): { x: number; y: number } {
  const hx = zoneWidth / 2
  const hy = zoneHeight / 2
  const qx = zoneWidth / 4
  const qy = zoneHeight / 4
  const q3x = (3 * zoneWidth) / 4
  const q3y = (3 * zoneHeight) / 4

  const positions: Record<AnchorId, { x: number; y: number }> = {
    'top-left': { x: 0, y: 0 },
    'top-mid': { x: hx, y: 0 },
    'top-right': { x: zoneWidth, y: 0 },
    'mid-left': { x: 0, y: hy },
    center: { x: hx, y: hy },
    'mid-right': { x: zoneWidth, y: hy },
    'bottom-left': { x: 0, y: zoneHeight },
    'bottom-mid': { x: hx, y: zoneHeight },
    'bottom-right': { x: zoneWidth, y: zoneHeight },
    'q-tl': { x: qx, y: qy },
    'q-tr': { x: q3x, y: qy },
    'q-bl': { x: qx, y: q3y },
    'q-br': { x: q3x, y: q3y },
    'mid-top': { x: hx, y: 0 },
    'mid-bottom': { x: hx, y: zoneHeight },
  }

  return positions[anchorId]
}

/** All anchor IDs. */
export const ALL_ANCHORS: AnchorId[] = [
  'top-left',
  'top-mid',
  'top-right',
  'mid-left',
  'center',
  'mid-right',
  'bottom-left',
  'bottom-mid',
  'bottom-right',
  'q-tl',
  'q-tr',
  'q-bl',
  'q-br',
  'mid-top',
  'mid-bottom',
]
