import { useState, useEffect } from 'react'
import { SentenceDisplay } from './SentenceDisplay'
import type { SentenceToken } from '../db/schema'
import type { TokenSource } from '../lib/saveTokenPos'
import { getTextFromTokens, isPunctuationOnlyToken } from '../lib/tokens'
import { matchSentencePattern, matchSentencePatternPartial } from '../lib/sentencePatternMatch'
import type { PageMediaQuestionEditorContext } from './pageMediaQuestionEditorContext'

export type PageMediaQuestionRow = {
  id: number
  sort_order: number
  tokens_array: SentenceToken[] | null
}

type Props = {
  questions: PageMediaQuestionRow[]
  posTypes: { id: number; label?: string; color?: string | null }[]
  canEdit: boolean
  onAdd: () => void
  onDelete: (q: PageMediaQuestionRow) => void
  onGenerateFromSentence?: () => void
  isGeneratingFromSentence?: boolean
  editor?: PageMediaQuestionEditorContext | null
}

export function PageMediaQuestionCarousel({
  questions,
  posTypes,
  canEdit,
  onAdd,
  onDelete,
  onGenerateFromSentence,
  isGeneratingFromSentence,
  editor,
}: Props) {
  const [idx, setIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order)
  const n = sorted.length

  useEffect(() => {
    setIdx((i) => (n === 0 ? 0 : Math.min(i, n - 1)))
  }, [n])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [editing])

  if (n === 0) {
    return canEdit ? (
      <div className="mt-3 border-t border-gray-200 pt-3 flex flex-wrap gap-2">
        <button type="button" className="text-sm border rounded px-2 py-1 hover:bg-gray-50" onClick={onAdd}>
          Add question
        </button>
        {onGenerateFromSentence && (
          <button
            type="button"
            className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            disabled={isGeneratingFromSentence}
            onClick={onGenerateFromSentence}
          >
            {isGeneratingFromSentence ? 'Generating…' : 'Generate from sentence…'}
          </button>
        )}
      </div>
    ) : null
  }

  const current = sorted[idx]!
  const tokens = current.tokens_array ?? []
  const sentencePatterns = editor?.sentencePatterns ?? []
  const fullMatch = matchSentencePattern(tokens, sentencePatterns)
  const partialMatch = !fullMatch ? matchSentencePatternPartial(tokens, sentencePatterns) : null
  const patternTitle = fullMatch
    ? `Matches: ${fullMatch.name}`
    : partialMatch
      ? `Contains pattern: ${partialMatch.name}`
      : 'No matching sentence pattern'
  const baseName = fullMatch?.name ?? partialMatch?.name
  const lastContentTokenIndex = (() => {
    let last = -1
    for (let i = 0; i < tokens.length; i++) {
      if (!isPunctuationOnlyToken(tokens[i])) last = i
    }
    return last
  })()
  const patternStarProps =
    editor && (fullMatch || partialMatch) && lastContentTokenIndex >= 0
      ? {
          index: lastContentTokenIndex,
          onClick: () => editor.onPatternClick(baseName ?? undefined, !!partialMatch, current.id),
          isPartial: !!partialMatch,
          title: patternTitle,
        }
      : null

  const tokenSource: TokenSource = { type: 'page_media_question', questionId: current.id }
  const kiwahaIdx = editor?.kiwahaSelectionIndicesForQuestion?.(current.id)

  const startEdit = () => {
    setEditText(getTextFromTokens({ tokens_array: tokens }))
    setEditing(true)
    editor?.tokenPosInteraction?.handleCloseSelector()
  }

  return (
    <div className="mt-3 w-full border-t border-gray-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-500">
          Question {idx + 1} / {n}
        </span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            onClick={() => setIdx((i) => (i - 1 + n) % n)}
          >
            Prev
          </button>
          <button
            type="button"
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            onClick={() => setIdx((i) => (i + 1) % n)}
          >
            Next
          </button>
          {canEdit && (
            <>
              <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={onAdd}>
                Add
              </button>
              {onGenerateFromSentence && (
                <button
                  type="button"
                  className="text-xs border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
                  disabled={isGeneratingFromSentence}
                  onClick={onGenerateFromSentence}
                >
                  {isGeneratingFromSentence ? 'Generating…' : 'From sentence…'}
                </button>
              )}
              <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={startEdit}>
                Edit text
              </button>
              <button type="button" className="text-xs border rounded px-2 py-1 border-red-200 text-red-800 hover:bg-red-50" onClick={() => onDelete(current)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {editing && editor ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full min-h-[120px] border rounded px-2 py-1 text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm border rounded px-2 py-1 bg-blue-600 text-white disabled:opacity-50"
              disabled={editor.isSavingText || !editText.trim()}
              onClick={() => {
                void Promise.resolve(editor.onSaveQuestionText(current.id, editText.trim())).then(() => setEditing(false))
              }}
            >
              Save
            </button>
            <button type="button" className="text-sm border rounded px-2 py-1" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="cursor-text"
          role="button"
          tabIndex={0}
          onDoubleClick={canEdit ? startEdit : undefined}
          onKeyDown={
            canEdit
              ? (e) => {
                  if (e.key === 'Enter' || e.key === 'F2') {
                    e.preventDefault()
                    startEdit()
                  }
                }
              : undefined
          }
          title={canEdit ? 'Double-click to edit question text' : undefined}
        >
          <SentenceDisplay
            tokens={tokens}
            sentenceNumber={idx + 1}
            sentenceId={current.id}
            tokenSource={tokenSource}
            posTypes={posTypes}
            chunkPatterns={(editor?.chunkPatterns ?? []).map((p) => ({
              name: '',
              sequence: p.sequence,
            }))}
            connectorDesigns={editor?.connectorDesigns ?? []}
            patternStarProps={patternStarProps}
            onMakePhraseClick={editor ? () => editor.onMakePhraseClick(current.id) : undefined}
            tokenPosInteraction={editor?.tokenPosInteraction}
            interactive={!!editor?.tokenPosInteraction}
            kiwahaSelectionIndices={kiwahaIdx}
          />
        </div>
      )}
    </div>
  )
}
