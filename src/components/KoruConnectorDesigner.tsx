import { useId, useMemo, useState } from 'react'
import {
  boundsFemale,
  boundsMale,
  boundsYinYang,
  buildFemalePathD,
  buildMalePathD,
  connectorClipPaths,
  joinLineX,
  rodOverlapIntoDisk,
  type KoruConnectorParams,
} from '../lib/connectorDesign/koruConnectorGeometry'
import { CONNECTOR_PREVIEW_FILL_EAST, CONNECTOR_PREVIEW_FILL_WEST } from '../lib/connectorVisualConfig'

export function KoruConnectorDesigner() {
  const uid = useId().replace(/:/g, '')
  const [connectorRadius, setConnectorRadius] = useState(10)
  const [rodThickness, setRodThickness] = useState(4)
  const [joinX, setJoinX] = useState(96)
  const [rodExtend, setRodExtend] = useState(72)
  const [verticalAlign, setVerticalAlign] = useState(0)
  const [showMale, setShowMale] = useState(true)
  const [showFemale, setShowFemale] = useState(true)
  const [showConnected, setShowConnected] = useState(true)
  /** Connected preview: rotate only the join disk (both halves), not the rods. */
  const [rotateDisk180, setRotateDisk180] = useState(false)
  const [previewFillWest, setPreviewFillWest] = useState(CONNECTOR_PREVIEW_FILL_WEST)
  const [previewFillEast, setPreviewFillEast] = useState(CONNECTOR_PREVIEW_FILL_EAST)

  const params: KoruConnectorParams = useMemo(
    () => ({
      connectorRadius,
      rodThickness,
      joinX,
      rodExtend,
      verticalAlign,
    }),
    [connectorRadius, rodThickness, joinX, rodExtend, verticalAlign]
  )

  const jx = useMemo(() => joinLineX(params), [params])
  const clip = useMemo(() => connectorClipPaths(params), [params])
  const rodOv = useMemo(() => rodOverlapIntoDisk(connectorRadius), [connectorRadius])
  const maleD = useMemo(() => buildMalePathD(params), [params])
  const femaleD = useMemo(() => buildFemalePathD(params), [params])
  const rodY0 = verticalAlign - rodThickness / 2

  const boundsJoined = useMemo(() => boundsYinYang(params), [params])

  const splitFemaleOffset = useMemo(() => {
    if (showConnected || !showMale || !showFemale) return 0
    const bM = boundsMale(params, 0)
    const bF = boundsFemale(params, 0)
    return bM.minX + bM.width + 28 - bF.minX
  }, [showConnected, showMale, showFemale, params])

  const pad = 16
  const viewBoxStr = useMemo(() => {
    if (!showMale && !showFemale) return `${-pad} ${-pad} 280 180`
    if (showConnected && showMale && showFemale) {
      const b = boundsJoined
      return `${b.minX} ${b.minY} ${b.width} ${b.height}`
    }
    if (showMale && showFemale && !showConnected) {
      const bM = boundsMale(params, pad)
      const bF = boundsFemale(params, pad)
      const minX = Math.min(bM.minX, bF.minX + splitFemaleOffset)
      const minY = Math.min(bM.minY, bF.minY)
      const maxX = Math.max(bM.minX + bM.width, bF.minX + bF.width + splitFemaleOffset)
      const maxY = Math.max(bM.minY + bM.height, bF.minY + bF.height)
      return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
    }
    if (showMale) {
      const b = boundsMale(params)
      return `${b.minX} ${b.minY} ${b.width} ${b.height}`
    }
    const b = boundsFemale(params)
    return `${b.minX} ${b.minY} ${b.width} ${b.height}`
  }, [
    showMale,
    showFemale,
    showConnected,
    boundsJoined,
    params,
    splitFemaleOffset,
  ])

  const slider = (
    label: string,
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
    step = 1
  ) => (
    <label className="flex flex-col gap-0.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full max-w-xs"
      />
      <span className="text-xs text-gray-500">{value}</span>
    </label>
  )

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Koru Connector Designer</h1>
        <p className="text-sm text-gray-600">
          Preview fills default from <span className="font-mono">connectorVisualConfig.ts</span>; use
          the pickers below (DevTools edits are overwritten on re-render).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 border rounded p-4 bg-gray-50">
        <label className="flex flex-col gap-0.5 text-sm">
          <span className="text-gray-600">West fill (g[0] west clip)</span>
          <input
            type="color"
            value={previewFillWest}
            onChange={(e) => setPreviewFillWest(e.target.value)}
            className="h-9 w-full max-w-xs cursor-pointer"
          />
          <span className="text-xs text-gray-500 font-mono">{previewFillWest}</span>
        </label>
        <label className="flex flex-col gap-0.5 text-sm">
          <span className="text-gray-600">East fill (g[1] east clip)</span>
          <input
            type="color"
            value={previewFillEast}
            onChange={(e) => setPreviewFillEast(e.target.value)}
            className="h-9 w-full max-w-xs cursor-pointer"
          />
          <span className="text-xs text-gray-500 font-mono">{previewFillEast}</span>
        </label>
        {slider('Connector radius (circle)', connectorRadius, setConnectorRadius, 6, 22)}
        {slider('Rod thickness', rodThickness, setRodThickness, 2, 12)}
        {slider('Join X (circle center)', joinX, setJoinX, 48, 200)}
        {slider('Rod extend (each side)', rodExtend, setRodExtend, 24, 160)}
        {slider('Baseline (vertical)', verticalAlign, setVerticalAlign, -8, 8)}
      </div>

      <div className="border rounded-lg bg-white p-4 min-h-[280px]">
        <p className="text-xs text-gray-500 mb-2">
          Primary — connected · g[0]=west {previewFillWest} · g[1]=east {previewFillEast}
        </p>
        <svg
          viewBox={viewBoxStr}
          className="w-full h-[300px] border border-gray-200 bg-white"
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="geometricPrecision"
        >
          <line
            x1={-2000}
            y1={verticalAlign}
            x2={4000}
            y2={verticalAlign}
            stroke="#e2e8f0"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <defs>
            <clipPath id={`koru-clip-left-${uid}`} clipPathUnits="userSpaceOnUse">
              <path d={clip.leftRodD} />
              <path d={clip.leftHalfD} />
            </clipPath>
            <clipPath
              id={`koru-clip-right-${uid}`}
              clipPathUnits="userSpaceOnUse"
              transform={
                !showConnected && showMale && showFemale
                  ? `translate(${splitFemaleOffset}, 0)`
                  : undefined
              }
            >
              <path fillRule="evenodd" d={clip.rightDiskClipEvenOddD} />
              <path d={clip.rightRodD} />
            </clipPath>
            <clipPath id={`koru-disk-west-${uid}`} clipPathUnits="userSpaceOnUse">
              <path d={clip.leftHalfD} />
            </clipPath>
            <clipPath id={`koru-disk-east-${uid}`} clipPathUnits="userSpaceOnUse">
              <path fillRule="evenodd" d={clip.rightDiskClipEvenOddD} />
            </clipPath>
          </defs>
          {showConnected && showMale && showFemale ? (
            <g id={`koru-connected-${uid}`}>
              <g
                transform={
                  rotateDisk180
                    ? `rotate(180 ${clip.cx} ${clip.cy})`
                    : undefined
                }
              >
                <g style={{ clipPath: `url(#koru-disk-west-${uid})` }}>
                  <circle cx={clip.cx} cy={clip.cy} r={clip.R} fill={previewFillWest} />
                </g>
                <g style={{ clipPath: `url(#koru-disk-east-${uid})` }}>
                  <circle cx={clip.cx} cy={clip.cy} r={clip.R} fill={previewFillEast} />
                </g>
              </g>
              <g style={{ clipPath: `url(#koru-clip-left-${uid})` }}>
                <rect
                  x={joinX - connectorRadius - rodExtend}
                  y={rodY0}
                  width={rodExtend + rodOv}
                  height={rodThickness}
                  fill={previewFillWest}
                />
              </g>
              <g style={{ clipPath: `url(#koru-clip-right-${uid})` }}>
                <rect
                  x={joinX + connectorRadius - rodOv}
                  y={rodY0}
                  width={rodExtend + rodOv}
                  height={rodThickness}
                  fill={previewFillEast}
                />
              </g>
            </g>
          ) : (
            <g>
              {showMale && (
                <g style={{ clipPath: `url(#koru-clip-left-${uid})` }}>
                  <circle cx={clip.cx} cy={clip.cy} r={clip.R} fill={previewFillWest} />
                  <rect
                    x={joinX - connectorRadius - rodExtend}
                    y={rodY0}
                    width={rodExtend + rodOv}
                    height={rodThickness}
                    fill={previewFillWest}
                  />
                </g>
              )}
              {showFemale && (
                <g transform={`translate(${splitFemaleOffset}, 0)`}>
                  <g style={{ clipPath: `url(#koru-clip-right-${uid})` }}>
                    <circle cx={clip.cx} cy={clip.cy} r={clip.R} fill={previewFillEast} />
                    <rect
                      x={joinX + connectorRadius - rodOv}
                      y={rodY0}
                      width={rodExtend + rodOv}
                      height={rodThickness}
                      fill={previewFillEast}
                    />
                  </g>
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 items-center text-sm border-t pt-4">
        <span className="text-gray-500 font-medium">Preview mode</span>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showConnected}
            onChange={(e) => setShowConnected(e.target.checked)}
          />
          Connected interlock (default)
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={rotateDisk180}
            onChange={(e) => setRotateDisk180(e.target.checked)}
            disabled={!showConnected}
          />
          Rotate join disk 180° (circles only)
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={showMale} onChange={(e) => setShowMale(e.target.checked)} />
          Show male
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showFemale}
            onChange={(e) => setShowFemale(e.target.checked)}
          />
          Show female
        </label>
      </div>

      <div className="border rounded p-3 bg-slate-900 text-slate-100 text-xs font-mono overflow-auto max-h-56">
        <p className="text-slate-400 mb-2">S-boundary (shared, open path)</p>
        <pre className="whitespace-pre-wrap break-all mb-4">{clip.sBoundaryD}</pre>
        <p className="text-slate-400 mb-2">Legacy combined d (join x = {jx})</p>
        <pre className="whitespace-pre-wrap break-all mb-2">{maleD}</pre>
        <pre className="whitespace-pre-wrap break-all">{femaleD}</pre>
      </div>
    </div>
  )
}
