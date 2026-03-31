import { useLayoutEffect, useRef } from 'react'
import { getPosTypeBackgroundColor, getPosLabelAbbrev } from '../lib/tokenStyling'
import { getPopupPosition, snapFixedPopupIntoViewport } from '../lib/popupPosition'
import type { HoveredToken } from '../hooks/useTokenPosInteraction'

export function PosHoverBar({
  hoveredToken,
  sortedPosTypes,
  onQuickSet,
  onMouseEnter,
  onMouseLeave,
}: {
  hoveredToken: HoveredToken
  sortedPosTypes: { id: number; code?: string; label?: string; color?: string | null }[]
  onQuickSet: (posTypeId: number) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = getPopupPosition(hoveredToken.rect, 56, Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 16 : 720))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    snapFixedPopupIntoViewport(el)
  }, [pos.left, pos.top, sortedPosTypes.length])
  return (
    <div
      ref={ref}
      className="fixed z-[100] flex gap-0.5 p-1 bg-white border rounded shadow-lg max-w-[calc(100vw-16px)]"
      style={{
        left: pos.left,
        top: pos.top,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {sortedPosTypes.map((p, i) => (
        <div key={p.id} className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-gray-500 font-mono">{i + 1}</span>
          <button
            type="button"
            title={`${p.label} (${i + 1})`}
            className="w-7 h-7 rounded text-xs font-medium text-gray-800 border border-gray-200 hover:border-gray-400"
            style={{ backgroundColor: getPosTypeBackgroundColor(p.color) }}
            onClick={() => onQuickSet(p.id)}
          >
            {getPosLabelAbbrev(p.label ?? p.code)}
          </button>
        </div>
      ))}
    </div>
  )
}
