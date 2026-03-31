/**
 * Canonical sentence display: number, star, moon, tokens.
 * Use this wherever a sentence should appear so layout stays consistent.
 */

import { TokenDisplay } from './TokenDisplay'
import type { SentenceToken } from '../db/schema'
import type { TokenSource } from '../lib/saveTokenPos'

type PatternStarProps = {
  index: number
  onClick: () => void
  isPartial: boolean
  title: string
}

type PosTypeLike = { id: number; code?: string; label?: string; color?: string | null }
type ChunkPattern = { name: string; sequence: number[] }
type ConnectorDesignLike = { pos_type_id: number; side: string; shape_config?: unknown }

export type SentenceDisplayProps = {
  tokens: SentenceToken[]
  sentenceNumber: number
  sentenceId?: number
  /** When set, word clicks/hover use this source (e.g. page picture questions). Default: story_sentence + sentenceId. */
  tokenSource?: TokenSource
  posTypes: PosTypeLike[]
  chunkPatterns?: ChunkPattern[]
  connectorDesigns?: ConnectorDesignLike[]
  /** When provided, star is clickable (full/half). When null, shows gray star. */
  patternStarProps?: PatternStarProps | null
  onMakePhraseClick?: () => void
  tokenPosInteraction?: {
    handleWordClick: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHover: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHoverEnd: () => void
  }
  onReorderClick?: (e: React.MouseEvent) => void
  interactive?: boolean
  kiwahaSelectionIndices?: Set<number>
}

export function SentenceDisplay({
  tokens,
  sentenceNumber,
  sentenceId = 0,
  tokenSource: tokenSourceProp,
  posTypes,
  chunkPatterns = [],
  connectorDesigns = [],
  patternStarProps,
  onMakePhraseClick,
  tokenPosInteraction,
  onReorderClick,
  interactive = false,
  kiwahaSelectionIndices,
}: SentenceDisplayProps) {
  const resolvedSource = (sid: number): TokenSource =>
    tokenSourceProp ?? { type: 'story_sentence', sentenceId: sid }

  const phraseButtonSlot =
    onMakePhraseClick != null ? (
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
    ) : null

  return (
    <TokenDisplay
      tokens={tokens}
      posTypes={posTypes}
      chunkPatterns={chunkPatterns}
      connectorDesigns={connectorDesigns}
      sentenceId={sentenceId}
      sentenceNumber={sentenceNumber}
      patternStarProps={patternStarProps}
      phraseButtonSlot={phraseButtonSlot}
      onReorderClick={onReorderClick}
      onWordClick={
        tokenPosInteraction
          ? (sid, wid, _word, e) => tokenPosInteraction.handleWordClick(resolvedSource(sid), wid, e)
          : undefined
      }
      onWordHover={
        tokenPosInteraction
          ? (sid, wid, e) => tokenPosInteraction.handleWordHover(resolvedSource(sid), wid, e)
          : undefined
      }
      onWordHoverEnd={tokenPosInteraction?.handleWordHoverEnd}
      interactive={interactive || !!tokenPosInteraction}
      kiwahaSelectionIndices={kiwahaSelectionIndices}
    />
  )
}
