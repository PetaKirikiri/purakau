/**
 * Computes popup position based on available viewport space.
 * Flips above/below and left/right to keep popup on screen.
 */

const PADDING = 8
const POPUP_MIN_HEIGHT = 120
const POPUP_MIN_WIDTH = 180

export type AnchorRect = { left: number; top: number; right: number; bottom: number }
export type AnchorPoint = { x: number; y: number }

export function getPopupPosition(
  anchor: AnchorRect | AnchorPoint,
  estimatedHeight = POPUP_MIN_HEIGHT,
  estimatedWidth = POPUP_MIN_WIDTH
): { top: number; left: number } {
  const rect = 'left' in anchor
    ? anchor
    : { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y }
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024

  const spaceBelow = vh - rect.bottom - PADDING
  const spaceAbove = rect.top - PADDING
  const spaceRight = vw - rect.left - PADDING
  const spaceLeft = rect.right - PADDING

  const showBelow = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove
  const showRight = spaceRight >= estimatedWidth || spaceRight >= spaceLeft

  let top: number
  if (showBelow) {
    top = rect.bottom + PADDING
  } else {
    top = rect.top - estimatedHeight - PADDING
  }

  let left: number
  if (showRight) {
    left = rect.left
  } else {
    left = Math.max(PADDING, rect.right - estimatedWidth)
  }

  top = Math.max(PADDING, Math.min(vh - estimatedHeight - PADDING, top))
  left = Math.max(PADDING, Math.min(vw - estimatedWidth - PADDING, left))

  return { top, left }
}

/** Nudge a `position: fixed` element so its bounding box stays inside the viewport. */
export function snapFixedPopupIntoViewport(el: HTMLElement): void {
  const pad = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = parseFloat(el.style.left)
  let top = parseFloat(el.style.top)
  if (Number.isNaN(left)) left = 0
  if (Number.isNaN(top)) top = 0
  for (let i = 0; i < 8; i++) {
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    const r = el.getBoundingClientRect()
    if (r.left >= pad && r.top >= pad && r.right <= vw - pad && r.bottom <= vh - pad) break
    if (r.right > vw - pad) left -= r.right - (vw - pad)
    if (r.left < pad) left += pad - r.left
    if (r.bottom > vh - pad) top -= r.bottom - (vh - pad)
    if (r.top < pad) top += pad - r.top
  }
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
}
