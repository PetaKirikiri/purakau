/**
 * Two underline rods sharing one connector boundary. Single SVG, zero gap.
 * Uses centralized getInterlockPreviewPaths with all four end configs.
 */

import { getInterlockPreviewPaths, type InterlockPreviewConfigs } from '../lib/connectorShapes'

const BAR_H = 20
const BAR_W = 80
const WIDTH = BAR_W * 2
const HEIGHT = 48
const BAR_Y = (HEIGHT - BAR_H) / 2

export function InterlockPreview({
  leftColor,
  rightColor,
  configs,
}: {
  leftColor: string
  rightColor: string
  configs: InterlockPreviewConfigs
}) {
  const { leftPathD, rightPathD } = getInterlockPreviewPaths(
    { barH: BAR_H, barY: BAR_Y, barW: BAR_W },
    configs
  )
  return (
    <svg
      viewBox={`${-BAR_W} 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className="block"
      style={{ shapeRendering: 'geometricPrecision' }}
    >
      <path d={leftPathD} fill={leftColor} />
      <path d={rightPathD} fill={rightColor} />
    </svg>
  )
}
