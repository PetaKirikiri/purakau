/**
 * Renders one story row (sentence). Same UI for persisted and draft rows.
 * Behavior differs by row.id: persisted has reorder/update/delete; draft has TokenInsertToolbar + Add to page.
 */

import { TokenDisplay } from './TokenDisplay'
import { SentenceDisplay } from './SentenceDisplay'
import { TokenInsertToolbar } from './TokenInsertToolbar'
import { getTokensForSentence, splitIntoSentences, isPunctuationOnlyToken } from '../lib/tokens'
import { matchSentencePattern, matchSentencePatternPartial } from '../lib/sentencePatternMatch'
import { isPersistedRow, type StoryRow } from '../lib/storyModel'
import type { SentenceToken } from '../db/schema'
import type { TokenSource } from '../lib/saveTokenPos'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { MdDragIndicator } from 'react-icons/md'

type SentencePattern = { id: number; name: string; pos_blueprint: number[] }
type ChunkPattern = { name: string; sequence: number[] }
type DraftPhrasePattern = { id: number | string; name: string; pos_pattern?: { sequence?: number[] } }
type PosType = { id: number; code?: string; label?: string; color?: string | null }

export type SentenceRowProps = {
  row: StoryRow
  posTypes: PosType[]
  chunkPatterns: ChunkPattern[]
  sentencePatterns: SentencePattern[]
  connectorDesigns?: { pos_type_id: number; side: string; shape_config?: unknown }[]
  isEditing: boolean
  editingText: string
  onEditStart: () => void
  onEditChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onPatternClick: (baseName?: string, isPartial?: boolean) => void
  onMakePhraseClick: () => void
  isSelected?: boolean
  isUpdating?: boolean
  isDeleting?: boolean
  tokenPosInteraction?: {
    handleWordClick: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHover: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHoverEnd: () => void
    handleCloseSelector: () => void
  }
  onReorderClick?: (e: React.MouseEvent) => void
  dragHandleListeners?: DraggableSyntheticListeners
  dragHandleDisabled?: boolean
  kiwahaSelectionIndices?: Set<number>
  draftProps?: {
    insertIndex: number
    onInsertIndexChange: (i: number) => void
    onTokensChange: (tokens: SentenceToken[]) => void
    onAddToPage: () => void
    isAddToPagePending?: boolean
    isAddToPageDisabled?: boolean
    phrasePatterns: DraftPhrasePattern[]
    sentencePatterns: SentencePattern[]
    wordsByPos: Record<number, string[]>
  }
}

export function SentenceRow({
  row,
  posTypes,
  chunkPatterns,
  sentencePatterns,
  connectorDesigns = [],
  isEditing,
  editingText,
  onEditStart,
  onEditChange,
  onSave,
  onCancel,
  onDelete,
  onPatternClick,
  onMakePhraseClick,
  isSelected = false,
  isUpdating = false,
  isDeleting = false,
  tokenPosInteraction,
  onReorderClick,
  dragHandleListeners,
  dragHandleDisabled = false,
  draftProps,
  kiwahaSelectionIndices,
}: SentenceRowProps) {
  const tokens = getTokensForSentence(row)
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
    (fullMatch || partialMatch) && lastContentTokenIndex >= 0
      ? {
          index: lastContentTokenIndex,
          onClick: () => onPatternClick(baseName ?? undefined, !!partialMatch),
          isPartial: !!partialMatch,
          title: patternTitle,
        }
      : null

  const dataSentenceId = row.id != null ? String(row.id) : 'draft'
  const rowClass = isSelected ? 'bg-amber-200/70 rounded px-0.5 -mx-0.5' : ''

  if (isEditing) {
    return (
      <span data-sentence-id={dataSentenceId} className={`block ${rowClass}`}>
        <span className="flex flex-col gap-2 w-full">
          <textarea
            value={editingText}
            onChange={(e) => onEditChange(e.target.value)}
            className="w-full min-h-[80vh] border rounded px-3 py-2 text-base resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!editingText.trim() || isUpdating}
              onClick={onSave}
            >
              Save
            </button>
            <button type="button" className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm border rounded border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={isDeleting}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
          {editingText.trim() && (
            <div className="text-xs text-gray-500 border-t pt-2 mt-1">
              Split preview:
              {splitIntoSentences(editingText).map((part, i) => (
                <div key={i} className="flex gap-2 mt-1 border-l-2 border-gray-200 pl-2">
                  <span className="font-mono shrink-0">{i === 0 ? `#${row.sentence_number ?? '—'}` : 'new'}</span>
                  <span>{part}</span>
                </div>
              ))}
            </div>
          )}
        </span>
      </span>
    )
  }

  const handleDoubleClick = () => {
    tokenPosInteraction?.handleCloseSelector()
    onEditStart()
  }

  return (
    <span
      data-sentence-id={dataSentenceId}
      role="button"
      tabIndex={0}
      className={`flex items-start gap-0.5 ${rowClass}`}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          handleDoubleClick()
        }
      }}
      title="Double-click to edit sentence"
    >
      {dragHandleListeners != null && isPersistedRow(row) && (
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab rounded border-0 bg-transparent p-0.5 text-gray-400 hover:text-gray-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Drag to reorder sentence"
          disabled={dragHandleDisabled}
          onClick={(e) => e.stopPropagation()}
          {...dragHandleListeners}
        >
          <MdDragIndicator className="text-lg" aria-hidden />
        </button>
      )}
      <span className="min-w-0 flex-1 cursor-text">
        {tokens.length === 0 ? (
          <span className="text-gray-400 italic">
            {draftProps ? 'Click to add tokens, or double-click to type...' : 'Empty — double-click to edit'}
          </span>
        ) : (
          <>
            <span className="cursor-text">
              {draftProps ? (
                <>
                  <TokenDisplay
                    tokens={tokens}
                    posTypes={posTypes}
                    chunkPatterns={chunkPatterns}
                    onWordClick={(_, i) => draftProps.onInsertIndexChange(i)}
                    interactive
                    sentenceNumber={row.sentence_number}
                    patternStarProps={patternStarProps}
                    phraseButtonSlot={
                      <button
                        type="button"
                        className="text-gray-400 hover:text-green-600 focus:outline-none bg-transparent border-0 p-0 cursor-pointer text-xs w-[1em] h-[1em] flex items-center justify-center leading-none"
                        title="Make phrase from leftover tokens"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMakePhraseClick()
                        }}
                      >
                        🌙
                      </button>
                    }
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      draftProps.onInsertIndexChange(tokens.length)
                    }}
                    className={`ml-1 px-1.5 py-0.5 rounded hover:bg-blue-100 text-sm ${
                      draftProps.insertIndex === tokens.length ? 'ring-1 ring-blue-400' : ''
                    }`}
                    title="Insert at end"
                  >
                    +
                  </button>
                </>
              ) : (
                <SentenceDisplay
                  tokens={tokens}
                  sentenceNumber={row.sentence_number}
                  sentenceId={row.id!}
                  posTypes={posTypes}
                  chunkPatterns={chunkPatterns}
                  connectorDesigns={connectorDesigns}
                  patternStarProps={patternStarProps}
                  onMakePhraseClick={onMakePhraseClick}
                  tokenPosInteraction={tokenPosInteraction}
                  onReorderClick={onReorderClick && isPersistedRow(row) ? onReorderClick : undefined}
                  interactive={!!tokenPosInteraction}
                  kiwahaSelectionIndices={kiwahaSelectionIndices}
                />
              )}
            </span>
            {draftProps && (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <TokenInsertToolbar
                  tokens={tokens}
                  insertIndex={draftProps.insertIndex}
                  onInsertIndexChange={draftProps.onInsertIndexChange}
                  onTokensChange={draftProps.onTokensChange}
                  posTypes={posTypes}
                  phrasePatterns={draftProps.phrasePatterns}
                  sentencePatterns={draftProps.sentencePatterns}
                  wordsByPos={draftProps.wordsByPos}
                />
                <button
                  type="button"
                  onClick={draftProps.onAddToPage}
                  disabled={draftProps.isAddToPagePending || draftProps.isAddToPageDisabled || tokens.length === 0}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add to page
                </button>
              </div>
            )}
          </>
        )}
      </span>
    </span>
  )
}
