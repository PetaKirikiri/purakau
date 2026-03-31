/**
 * Tokens/Phrases/Sentences dropdowns for inserting into a token buffer.
 * Shared by StoryEditor (empty story draft row).
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { getPosTypeBackgroundColor } from '../lib/tokenStyling'
import type { SentenceToken } from '../db/schema'

type PosType = { id: number; code: string; label: string; color?: string | null }
type PhrasePattern = { id: number | string; name: string; pos_pattern?: { sequence?: number[] } }
type SentencePattern = { id: number; name: string; pos_blueprint?: number[] }

function reindexTokens(tokens: SentenceToken[]): SentenceToken[] {
  return tokens.map((t, i) => ({ ...t, index: i + 1 }))
}

export function TokenInsertToolbar({
  tokens,
  insertIndex,
  onInsertIndexChange,
  onTokensChange,
  posTypes = [],
  phrasePatterns = [],
  sentencePatterns = [],
  wordsByPos = {},
}: {
  tokens: SentenceToken[]
  insertIndex: number
  onInsertIndexChange: (i: number) => void
  onTokensChange: (t: SentenceToken[]) => void
  posTypes: PosType[]
  phrasePatterns: PhrasePattern[]
  sentencePatterns: SentencePattern[]
  wordsByPos: Record<number, string[]>
}) {
  const [tokensOpen, setTokensOpen] = useState(false)
  const [phrasesOpen, setPhrasesOpen] = useState(false)
  const [sentencesOpen, setSentencesOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTokensOpen(false)
        setPhrasesOpen(false)
        setSentencesOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const insertTokensAt = useCallback(
    (newTokens: SentenceToken[]) => {
      const before = tokens.slice(0, insertIndex)
      const after = tokens.slice(insertIndex)
      const merged = [...before, ...newTokens, ...after]
      onTokensChange(reindexTokens(merged))
      onInsertIndexChange(insertIndex + newTokens.length)
    },
    [tokens, insertIndex, onTokensChange, onInsertIndexChange]
  )

  const handleTokenSelect = (pt: PosType) => {
    const word = wordsByPos[pt.id]?.[0] ?? pt.label
    const t: SentenceToken = {
      index: 0,
      text: word,
      pos_type_id: pt.id,
      word_pos_entry_id: null,
    }
    insertTokensAt([t])
    setTokensOpen(false)
  }

  const handlePhraseSelect = (p: PhrasePattern) => {
    const seq = (p.pos_pattern?.sequence ?? []) as number[]
    const newTokens: SentenceToken[] = seq.map((posId) => {
      const word = wordsByPos[posId]?.[0] ?? posTypes.find((pt) => pt.id === posId)?.label ?? '?'
      return {
        index: 0,
        text: word,
        pos_type_id: posId,
        word_pos_entry_id: null,
      }
    })
    if (newTokens.length > 0) insertTokensAt(newTokens)
    setPhrasesOpen(false)
  }

  const handleSentenceSelect = (s: SentencePattern) => {
    const blueprint = (s.pos_blueprint ?? []) as number[]
    const newTokens: SentenceToken[] = blueprint.map((posId) => {
      const word = wordsByPos[posId]?.[0] ?? posTypes.find((pt) => pt.id === posId)?.label ?? '?'
      return {
        index: 0,
        text: word,
        pos_type_id: posId,
        word_pos_entry_id: null,
      }
    })
    if (newTokens.length > 0) insertTokensAt(newTokens)
    setSentencesOpen(false)
  }

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setTokensOpen(!tokensOpen)
            setPhrasesOpen(false)
            setSentencesOpen(false)
          }}
          className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-100"
        >
          Tokens ▾
        </button>
        {tokensOpen && (
          <div className="absolute top-full left-0 mt-1 z-10 py-1 bg-white border rounded shadow-lg max-h-60 overflow-auto min-w-max">
            {posTypes.map((pt) => (
              <button
                key={pt.id}
                type="button"
                onClick={() => handleTokenSelect(pt)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                style={{ borderLeft: `3px solid ${getPosTypeBackgroundColor(pt.color)}` }}
              >
                {pt.label}
              </button>
            ))}
            {!posTypes.length && (
              <div className="px-3 py-2 text-sm text-gray-500">No POS types</div>
            )}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setPhrasesOpen(!phrasesOpen)
            setTokensOpen(false)
            setSentencesOpen(false)
          }}
          className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-100"
        >
          Phrases ▾
        </button>
        {phrasesOpen && (
          <div className="absolute top-full left-0 mt-1 z-10 py-1 bg-white border rounded shadow-lg max-h-60 overflow-auto min-w-max">
            {phrasePatterns.map((p) => {
              const seq = (p.pos_pattern?.sequence ?? []) as number[]
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePhraseSelect(p)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex flex-wrap items-center gap-1"
                  title={p.name}
                >
                  {seq.map((posId, idx) => {
                    const pt = posTypes.find((t) => t.id === posId)
                    return (
                      <span
                        key={`${p.id}-${idx}`}
                        className="px-2 py-0.5 text-xs rounded shrink-0"
                        style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                      >
                        {pt?.label ?? posId}
                      </span>
                    )
                  })}
                  {seq.length === 0 && <span className="text-gray-400">—</span>}
                </button>
              )
            })}
            {!phrasePatterns.length && (
              <div className="px-3 py-2 text-sm text-gray-500">No phrases</div>
            )}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setSentencesOpen(!sentencesOpen)
            setTokensOpen(false)
            setPhrasesOpen(false)
          }}
          className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-100"
        >
          Sentences ▾
        </button>
        {sentencesOpen && (
          <div className="absolute top-full left-0 mt-1 z-10 py-1 bg-white border rounded shadow-lg max-h-60 overflow-auto min-w-max">
            {sentencePatterns.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSentenceSelect(s)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
              >
                {s.name}
              </button>
            ))}
            {!sentencePatterns.length && (
              <div className="px-3 py-2 text-sm text-gray-500">No sentences</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
