/**
 * Rod preview using centralized connector shape logic.
 */

import { getConnectorPathD } from '../lib/connectorShapes'
import type { ConnectorShapeConfig } from '../db/schema'
import type { ConnectorAt } from '../lib/connectorShapes'

export function ConnectorRodPreview({
  color,
  label,
  connectorAt,
  config,
  width,
  height,
}: {
  color: string
  label: string
  connectorAt: ConnectorAt
  config: ConnectorShapeConfig
  width: number
  height: number
}) {
  const barH = 4
  const barY = (height - barH) / 2
  const barW = width * 0.7
  const pathD = getConnectorPathD(config, connectorAt, { barH, barY, barW, width })
  return (
    <g>
      <path d={pathD} fill={color} />
      <text x={width / 2} y={height - 2} textAnchor="middle" fontSize={9} fill="#666">
        {label}
      </text>
    </g>
  )
}
