/**
 * Centralized token/word formatting. Used by StoryEditor and Words.
 * Single source of truth for how tagged words appear (underline only).
 * Connector shapes derived from connectorShapes (no hardcoded paths).
 */

import type { CSSProperties } from 'react'
import { getUnderlineEndPathD } from './connectorShapes'
import type { ConnectorShapeConfig } from '../db/schema'
import { UNDERLINE_THICKNESS } from './connectorVisualConfig'

export { UNDERLINE_THICKNESS }

export const FALLBACK_POS_COLOR = '#e5e7eb'

export function isValidTokenColor(color: string | null | undefined): boolean {
  return !!color && /^#[0-9A-Fa-f]{6}$/.test(color)
}

export function getPosTypeBackgroundColor(color: string | null | undefined): string {
  return isValidTokenColor(color) ? color! : FALLBACK_POS_COLOR
}

/** First letter of each word for POS button (e.g. "nominal predicate" → "NP") */
export function getPosLabelAbbrev(label: string | undefined | null): string {
  const s = (label ?? '').trim()
  if (!s) return '?'
  const letters = s.split(/\s+/).filter(Boolean).map((w) => w[0])
  return letters.length > 0 ? letters.join('').toUpperCase() : '?'
}

const VIEWBOX_H = UNDERLINE_THICKNESS

/** Underline as filled rect - flat ends. */
function underlineSvgFlat(color: string): string {
  const enc = encodeURIComponent(color)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 ${VIEWBOX_H}' preserveAspectRatio='none'%3E%3Crect x='0' y='0' width='100' height='${VIEWBOX_H}' fill='${enc}'/%3E%3C/svg%3E")`
}

/** Connector end - derived from connectorShapes (wave, koru, etc). Single source of truth. */
function underlineSvgFromConnector(
  color: string,
  end: 'left' | 'right',
  config: ConnectorConfigLike,
  variant: 'left' | 'right'
): string {
  const enc = encodeURIComponent(color)
  const pathD = getUnderlineEndPathD(
    VIEWBOX_H,
    end,
    config as ConnectorShapeConfig,
    variant
  )
  const pathEnc = encodeURIComponent(pathD)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 ${VIEWBOX_H}' preserveAspectRatio='none'%3E%3Cpath d='${pathEnc}' fill='${enc}'/%3E%3C/svg%3E")`
}


/** Cap style: which ends get rounded. First token=left, last=right, middle=none, standalone=both. */
export type UnderlineCapStyle = 'left' | 'right' | 'flat' | 'both'

export function getUnderlineCapClass(cap: UnderlineCapStyle): string {
  switch (cap) {
    case 'left':
      return 'rounded-l'
    case 'right':
      return 'rounded-r'
    case 'both':
      return 'rounded'
    default:
      return ''
  }
}

type ConnectorConfigLike = { type?: string; gender?: string; radius?: number; inset?: number } | null | undefined

function getEndVariant(config: ConnectorConfigLike, end: 'left' | 'right'): 'left' | 'right' {
  const gender = config?.gender ?? 'male'
  return (end === 'right' && gender === 'male') || (end === 'left' && gender === 'female') ? 'right' : 'left'
}

function getEndSvg(color: string, config: ConnectorConfigLike, end: 'left' | 'right'): string {
  if (!config || config.gender === 'none') return underlineSvgFlat(color)
  const variant = getEndVariant(config, end)
  if (config.type === 'wave' || config.type === 'koru') {
    return underlineSvgFromConnector(color, end, config, variant)
  }
  return underlineSvgFlat(color)
}

/** Underline style. No horizontal padding - underline length = content width only. */
export function getTokenStyle(
  underlineColor: string | null | undefined,
  connectorConfigLeft?: ConnectorConfigLike,
  connectorConfigRight?: ConnectorConfigLike,
  connectorConfigLegacy?: ConnectorConfigLike,
  connectorEndLegacy?: 'left' | 'right'
): CSSProperties | undefined {
  if (!isValidTokenColor(underlineColor)) return undefined
  const color = underlineColor as string
  const t = UNDERLINE_THICKNESS
  const base: CSSProperties = {
    backgroundImage: underlineSvgFlat(color),
    backgroundSize: `100% ${t}px`,
    backgroundPosition: 'bottom',
    backgroundRepeat: 'no-repeat',
    paddingBottom: t,
    paddingLeft: 0,
    paddingRight: 0,
  }
  const hasLeft = connectorConfigLeft && connectorConfigLeft.gender !== 'none'
  const hasRight = connectorConfigRight && connectorConfigRight.gender !== 'none'
  const hasLegacy = connectorConfigLegacy && connectorEndLegacy && connectorConfigLegacy.gender !== 'none'

  if (hasLeft && hasRight) {
    const leftSvg = getEndSvg(color, connectorConfigLeft, 'left')
    const rightSvg = getEndSvg(color, connectorConfigRight, 'right')
    base.backgroundImage = `${leftSvg}, ${rightSvg}`
    base.backgroundSize = `50% ${t}px, 50% ${t}px`
    base.backgroundPosition = `0 bottom, 100% bottom`
  } else if (hasLeft) {
    base.backgroundImage = getEndSvg(color, connectorConfigLeft, 'left')
  } else if (hasRight) {
    base.backgroundImage = getEndSvg(color, connectorConfigRight, 'right')
  } else if (hasLegacy) {
    const variant = getEndVariant(connectorConfigLegacy, connectorEndLegacy)
    if (connectorConfigLegacy!.type === 'wave' || connectorConfigLegacy!.type === 'koru') {
      base.backgroundImage = underlineSvgFromConnector(
        color,
        connectorEndLegacy === 'right' ? 'right' : 'left',
        connectorConfigLegacy,
        variant
      )
    } else {
      const r =
        connectorConfigLegacy!.type === 'round' && connectorConfigLegacy!.radius != null
          ? Math.min(connectorConfigLegacy!.radius * 4, t)
          : 0
      const inset = connectorConfigLegacy!.type === 'bevel' && connectorConfigLegacy!.inset != null ? connectorConfigLegacy!.inset : 0
      if (connectorEndLegacy === 'right') {
        base.borderTopRightRadius = base.borderBottomRightRadius = r ? `${r}px` : 0
        if (inset) base.clipPath = `polygon(0 0, calc(100% - ${inset}px) 0, 100% 100%, ${inset}px 100%)`
      } else {
        base.borderTopLeftRadius = base.borderBottomLeftRadius = r ? `${r}px` : 0
        if (inset) base.clipPath = `polygon(${inset}px 0, 100% 0, calc(100% - ${inset}px) 100%, 0 100%)`
      }
    }
  }
  return base
}

/** Base token styling. No horizontal padding - text flow is authority; punctuation must not be pushed away. */
export const TOKEN_CLASS_BASE = 'rounded'
export const TOKEN_CLASS_INTERACTIVE = 'cursor-pointer hover:bg-gray-100'

/** Split token into leading punct, word, trailing punct. Text is authority - no trimming. */
export function splitWordAndPunctuation(text: string): { leading: string; word: string; trailing: string } {
  const leadingMatch = text.match(/^[.,;:!?'"()[\]{}–—…\u2018\u2019\u201C\u201D\s]+/)
  const trailingMatch = text.match(/[.,;:!?'"()[\]{}–—…\u2018\u2019\u201C\u201D\s]+$/)
  const leading = leadingMatch?.[0] ?? ''
  const trailing = trailingMatch?.[0] ?? ''
  const word = text.slice(leading.length, text.length - trailing.length)
  return { leading, word, trailing }
}
