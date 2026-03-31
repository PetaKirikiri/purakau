/**
 * POS type selector popover shown on token click.
 * Choose a POS type for the clicked token; when set, show other words from that POS list.
 */

import { useEffect, useRef } from 'react'
import { getPosTypeBackgroundColor, getPosLabelAbbrev } from '../lib/tokenStyling'
import { stripPunctuationFromWord } from '../lib/tokens'
import { CenteredViewportPopup } from './CenteredViewportPopup'

type PosTypeLike = { id: number; code?: string; label?: string; color?: string | null }

export function TokenPosSelector({
  posTypes,
  currentPosId,
  currentWord,
  wordsByPos = {},
  onSelect,
  onReplaceWord,
  onClose,
  mode = 'full',
}: {
  posTypes: PosTypeLike[]
  currentPosId: number | null
  currentWord?: string
  wordsByPos?: Record<number, string[]>
  onSelect: (posTypeId: number, asAuto?: boolean) => void
  onReplaceWord?: (word: string) => void
  onClose: () => void
  /** 'pos' = POS selection only (hover). 'metadata' = replace word / metadata (click). 'full' = both. */
  mode?: 'pos' | 'metadata' | 'full'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const posIdForWords = currentPosId
  const words = posIdForWords != null ? (wordsByPos[posIdForWords] ?? []) : []
  const currentNorm = currentWord ? stripPunctuationFromWord(currentWord).toLowerCase() : ''
  const otherWords = words.filter((w) => stripPunctuationFromWord(w).toLowerCase() !== currentNorm)

  return (
    <CenteredViewportPopup panelRef={ref} zClassName="z-[100]">
      <div className="flex flex-col gap-1 p-1.5 bg-white border rounded shadow-lg">
      <div className="flex gap-0.5 flex-wrap">
        {posTypes.map((p, i) => (
          <div key={p.id} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-gray-500 font-mono">{i + 1}</span>
            <button
              type="button"
              title={`${p.label ?? p.code} (${i + 1})`}
              className={`w-7 h-7 rounded text-xs font-medium text-gray-800 border hover:border-gray-400 ${
                currentPosId === p.id ? 'ring-2 ring-blue-500' : 'border-gray-200'
              }`}
              style={{ backgroundColor: getPosTypeBackgroundColor(p.color) }}
              onClick={(e) => {
                const asAuto = !!e.shiftKey
                onSelect(p.id, asAuto)
              }}
            >
              {getPosLabelAbbrev(p.label ?? p.code)}
            </button>
          </div>
        ))}
      </div>
      {(mode === 'metadata' || mode === 'full') && currentPosId != null && otherWords.length > 0 && onReplaceWord && (
        <div className="border-t pt-1.5 mt-0.5">
          <p className="text-[10px] text-gray-500 mb-1">Other words:</p>
          <div className="flex flex-wrap gap-1">
            {otherWords.slice(0, 20).map((w) => (
              <button
                key={w}
                type="button"
                className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100"
                onClick={() => {
                  onReplaceWord(w)
                  onClose()
                }}
              >
                {w}
              </button>
            ))}
            {otherWords.length > 20 && (
              <span className="text-[10px] text-gray-400 self-center">+{otherWords.length - 20} more</span>
            )}
          </div>
        </div>
      )}
      </div>
    </CenteredViewportPopup>
  )
}
