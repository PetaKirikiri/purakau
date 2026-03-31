import { useEffect, useState } from 'react'
import { TokenWord } from './TokenWord'
import { resolveToken } from '../lib/tokens'
type PosType = { id: number; code: string; label: string; color?: string | null }
type PosEntry = { pos_type_id: number; code: string; auto?: boolean }

export type WordTestRow = { word_text: string; pos_types: unknown }

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function WordsTestModal({
  open,
  onClose,
  words,
  posTypes,
}: {
  open: boolean
  onClose: () => void
  words: WordTestRow[]
  posTypes: PosType[]
}) {
  const [order, setOrder] = useState<WordTestRow[]>([])
  const [idx, setIdx] = useState(0)
  const [showTags, setShowTags] = useState(false)

  useEffect(() => {
    if (!open || words.length === 0) return
    setOrder(shuffle(words))
    setIdx(0)
    setShowTags(false)
  }, [open, words])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const current = order[idx]
  const posList = (current?.pos_types ?? []) as PosEntry[]
  const tokenForTab = {
    index: 0,
    text: '',
    pos_type_id: posList[0]?.pos_type_id ?? null,
    word_pos_entry_id: null,
  }
  const resolved = resolveToken(tokenForTab, posTypes)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="words-test-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 id="words-test-title" className="text-lg font-semibold">
            Test words
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {words.length === 0 ? (
          <p className="text-gray-500 text-sm">No words to test.</p>
        ) : !current ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {idx + 1} / {order.length}
            </p>
            <div className="flex justify-center py-8">
              <TokenWord
                text={current.word_text}
                underlineColor={resolved.underlineColor}
                className="text-2xl font-medium"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-center mb-4 min-h-[2rem]">
              {showTags &&
                posList.map((p) => {
                  const label = posTypes.find((pt) => pt.id === p.pos_type_id)?.label ?? p.code
                  return (
                    <span key={p.pos_type_id} className="px-2 py-1 rounded bg-gray-100 text-sm">
                      {label}
                    </span>
                  )
                })}
            </div>
            <div className="flex flex-wrap gap-2 justify-between">
              <button
                type="button"
                onClick={() => setShowTags((s) => !s)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
              >
                {showTags ? 'Hide' : 'Show'} tags
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrder(shuffle(words))
                  setIdx(0)
                  setShowTags(false)
                }}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
              >
                Shuffle
              </button>
              <button
                type="button"
                onClick={() => setIdx((i) => (i + 1) % order.length)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
