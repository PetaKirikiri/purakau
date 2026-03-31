/**
 * Single primitive for content with optional underline.
 * Underline length = content width only (no padding). Text flow is authority.
 * connectorConfigLeft/Right drive SVG shape on each end (from Connectors dropdowns).
 */

import { getTokenStyle, getUnderlineCapClass } from '../lib/tokenStyling'
import type { UnderlineCapStyle } from '../lib/tokenStyling'
import type { ConnectorShapeConfig } from '../db/schema'

type TokenUnderlineProps = {
  underlineColor?: string | null
  capStyle?: UnderlineCapStyle
  connectorConfigLeft?: ConnectorShapeConfig | null
  connectorConfigRight?: ConnectorShapeConfig | null
  /** @deprecated use connectorConfigLeft/Right */
  connectorConfig?: ConnectorShapeConfig | null
  /** @deprecated use connectorConfigLeft/Right */
  connectorEnd?: 'left' | 'right'
  children: React.ReactNode
}

export function TokenUnderline({
  underlineColor,
  capStyle = 'both',
  connectorConfigLeft,
  connectorConfigRight,
  connectorConfig,
  connectorEnd,
  children,
}: TokenUnderlineProps) {
  const style = getTokenStyle(
    underlineColor,
    connectorConfigLeft ?? undefined,
    connectorConfigRight ?? undefined,
    connectorConfig,
    connectorEnd
  )
  const capClass = getUnderlineCapClass(capStyle)
  return (
    <span className={capClass || undefined} style={style ?? undefined}>
      {children}
    </span>
  )
}
