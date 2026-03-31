/**
 * Centralized token display. Single entry point for rendering tokens with
 * underlines, pattern chunks, and punctuation handling.
 */

import { findPatternRuns } from '../lib/patternMatch'
import { resolveToken, isPunctuationOnlyToken } from '../lib/tokens'
import { splitWordAndPunctuation, UNDERLINE_THICKNESS } from '../lib/tokenStyling'
import { TokenUnderline } from './TokenUnderline'
import { TokenWord } from './TokenWord'
import { getInterlockPaths } from '../lib/connectorShapes'
import type { SentenceToken, ConnectorShapeConfig } from '../db/schema'
import type { PosPattern } from '../lib/patternMatch'
import type { PosTypeLike } from '../lib/tokens'

type ChunkConnectorConfigs = {
  leftEnd?: ConnectorShapeConfig
  rightEnd?: ConnectorShapeConfig
  meetingRight?: ConnectorShapeConfig
  meetingLeft?: ConnectorShapeConfig
}

type PatternStarProps = {
  index: number
  onClick: () => void
  isPartial: boolean
  title: string
}

type TokenChunkInternalProps = {
  tokens: SentenceToken[]
  startIndex: number
  posTypes: PosTypeLike[]
  sentenceId: number
  onWordClick: (sentenceId: number, wordIndex: number, word: string, e: React.MouseEvent<HTMLSpanElement>) => void
  onWordHover?: (sentenceId: number, wordIndex: number, e: React.MouseEvent<HTMLElement>) => void
  onWordHoverEnd?: () => void
  connectorConfigs?: ChunkConnectorConfigs
  kiwahaSelectionIndices?: Set<number>
}

const BAR_W = 80
const BAR_H = UNDERLINE_THICKNESS
const BAR_Y = 0

function TokenChunkInternal({
  tokens,
  startIndex,
  posTypes,
  sentenceId,
  onWordClick,
  onWordHover,
  onWordHoverEnd,
  connectorConfigs,
  kiwahaSelectionIndices,
}: TokenChunkInternalProps) {
  const useChunkSvg =
    connectorConfigs?.meetingRight &&
    connectorConfigs?.meetingLeft &&
    connectorConfigs.meetingRight.gender !== 'none' &&
    connectorConfigs.meetingLeft.gender !== 'none'

  const meetingConfig: ConnectorShapeConfig = useChunkSvg
    ? { type: (connectorConfigs!.meetingRight!.type ?? 'koru') as ConnectorShapeConfig['type'], gender: connectorConfigs!.meetingRight!.gender }
    : { type: 'koru', gender: 'none' }
  const { leftPathD, rightPathD } = getInterlockPaths(
    { barH: BAR_H, barY: BAR_Y, barW: BAR_W },
    meetingConfig
  )

  const firstColor = resolveToken(tokens[0], posTypes).underlineColor
  const lastColor = resolveToken(tokens[tokens.length - 1], posTypes).underlineColor
  const leftColor = firstColor && /^#[0-9A-Fa-f]{6}$/.test(firstColor) ? firstColor : '#e5e7eb'
  const rightColor = lastColor && /^#[0-9A-Fa-f]{6}$/.test(lastColor) ? lastColor : '#e5e7eb'

  return (
    <span
      className="rounded"
      style={
        useChunkSvg
          ? { position: 'relative' as const, paddingBottom: BAR_H, display: 'inline-block' }
          : undefined
      }
    >
      {tokens.map((t, i) => {
        const wordIdx = startIndex + i
        const resolved = resolveToken(t, posTypes)
        const { leading, word, trailing } = splitWordAndPunctuation(t.text ?? '')
        const tokenText = t.text ?? ''
        const nextIsPunct = i < tokens.length - 1 && isPunctuationOnlyToken(tokens[i + 1])
        const addJoiningSpace = word && i < tokens.length - 1 && !nextIsPunct
        const wordWithSpace = addJoiningSpace ? word + ' ' : word
        const capStyle = tokens.length === 1 ? 'both' : i === 0 ? 'left' : i === tokens.length - 1 ? 'right' : 'flat'
        const connectorLeft = useChunkSvg ? undefined : (i === 0 ? connectorConfigs?.leftEnd : connectorConfigs?.meetingLeft)
        const connectorRight = useChunkSvg ? undefined : (i === 0 ? connectorConfigs?.meetingRight : connectorConfigs?.rightEnd)
        const globalIdx = startIndex + i
        const inKiwahaSelectChunk = kiwahaSelectionIndices?.has(globalIdx)
        const kiwahaClass = inKiwahaSelectChunk ? 'ring-2 ring-amber-400/80 rounded' : ''
        const wordEl =
          word ? (
            useChunkSvg ? (
              <span className={kiwahaClass || undefined}>
                <TokenWord
                  text={wordWithSpace}
                  inChunk
                  interactive
                  title={resolved.posLabel || 'Click to set POS'}
                  onClick={(e) => onWordClick(sentenceId, wordIdx, tokenText, e)}
                />
              </span>
            ) : (
              <TokenUnderline
                underlineColor={resolved.underlineColor}
                capStyle={capStyle}
                connectorConfigLeft={connectorLeft}
                connectorConfigRight={connectorRight}
              >
                <span className={kiwahaClass || undefined}>
                  <TokenWord
                    text={wordWithSpace}
                    inChunk
                    interactive
                    title={resolved.posLabel || 'Click to set POS'}
                    onClick={(e) => onWordClick(sentenceId, wordIdx, tokenText, e)}
                  />
                </span>
              </TokenUnderline>
            )
          ) : null
        const content = <>{leading}{wordEl}{trailing}</>
        const wrapped =
          onWordHover && onWordHoverEnd ? (
            <span onMouseEnter={(e) => onWordHover(sentenceId, wordIdx, e)} onMouseLeave={onWordHoverEnd}>
              {content}
            </span>
          ) : (
            content
          )
        return <span key={i} className="inline">{wrapped}</span>
      })}
      {useChunkSvg && (
        <svg
          viewBox={`${-BAR_W} 0 ${BAR_W * 2} ${BAR_Y + BAR_H}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: BAR_H,
            pointerEvents: 'none',
          }}
        >
          <path d={leftPathD} fill={leftColor} />
          <path d={rightPathD} fill={rightColor} />
        </svg>
      )}
    </span>
  )
}

export type MakePhraseMode = {
  inPhraseIndices: Set<number>
  selectedIndices: Set<number>
  onTokenSelect: (index: number) => void
}

export type ConnectorDesignLike = { pos_type_id: number; side: string; shape_config?: unknown }

export type TokenDisplayProps = {
  tokens: SentenceToken[]
  posTypes: PosTypeLike[]
  chunkPatterns?: PosPattern[]
  connectorDesigns?: ConnectorDesignLike[]
  sentenceId?: number
  onWordClick?: (sentenceId: number, wordIndex: number, word: string, e: React.MouseEvent<HTMLSpanElement>) => void
  onWordHover?: (sentenceId: number, wordIndex: number, e: React.MouseEvent<HTMLElement>) => void
  onWordHoverEnd?: () => void
  interactive?: boolean
  makePhraseMode?: MakePhraseMode
  connectorConfigs?: ChunkConnectorConfigs
  /** Pattern star above last content token (clickable, opens sentence pattern). */
  patternStarProps?: PatternStarProps | null
  /** Phrase button rendered next to the pattern star. */
  phraseButtonSlot?: React.ReactNode
  /** Sentence number shown above first token (left of above row). */
  sentenceNumber?: number | null
  /** When provided, sentence number is a clickable reorder button. */
  onReorderClick?: (e: React.MouseEvent) => void
  /** Indices being selected for a new kīwaha (shift+click). */
  kiwahaSelectionIndices?: Set<number>
}

export function TokenDisplay({
  tokens,
  posTypes,
  chunkPatterns = [],
  sentenceId = 0,
  onWordClick = () => {},
  onWordHover,
  onWordHoverEnd,
  interactive = false,
  makePhraseMode,
  connectorConfigs,
  connectorDesigns = [],
  patternStarProps,
  phraseButtonSlot,
  sentenceNumber,
  onReorderClick,
  kiwahaSelectionIndices,
}: TokenDisplayProps) {
  if (makePhraseMode) {
    const { inPhraseIndices, selectedIndices, onTokenSelect } = makePhraseMode
    return (
      <>
        {tokens.map((token, i) => {
          const resolved = resolveToken(token, posTypes)
          const isPunct = isPunctuationOnlyToken(token)
          const inPhrase = inPhraseIndices.has(i)
          const selected = selectedIndices.has(i)
          const canSelect = !isPunct && !inPhrase && token.pos_type_id != null
          const content = (
            <TokenWord
              text={token.text ?? ''}
              underlineColor={resolved.underlineColor}
              interactive={canSelect}
              title={inPhrase ? 'In existing phrase' : canSelect ? (selected ? 'Click to deselect' : 'Click to select') : undefined}
              onClick={canSelect ? () => onTokenSelect(i) : undefined}
            />
          )
          return (
            <span key={i}>
              {i > 0 && !isPunct && !isPunctuationOnlyToken(tokens[i - 1]) ? ' ' : ''}
              <span
                className={
                  inPhrase
                    ? 'opacity-50 cursor-default'
                    : selected
                      ? 'ring-2 ring-amber-500 rounded'
                      : canSelect
                        ? 'cursor-pointer rounded'
                        : 'rounded'
                }
              >
                {content}
              </span>
            </span>
          )
        })}
      </>
    )
  }

  const runs = findPatternRuns(tokens, chunkPatterns)
  const runByStart = new Map(runs.map((r) => [r.start, r]))
  const inRun = new Set(runs.flatMap((r) => Array.from({ length: r.end - r.start }, (_, j) => r.start + j)))

  const getConfig = (posTypeId: number | null, side: 'left' | 'right'): ConnectorShapeConfig | undefined => {
    if (posTypeId == null) return undefined
    const d = connectorDesigns.find((c) => c.pos_type_id === posTypeId && c.side === side)
    const sc = d?.shape_config
    if (sc && typeof sc === 'object') return sc as ConnectorShapeConfig
    return undefined
  }

  const showAboveRow = sentenceNumber != null || patternStarProps || phraseButtonSlot
  const sentenceNumLabel = sentenceNumber != null ? `[${sentenceNumber}]` : null
  const showStarAndMoon = patternStarProps != null || phraseButtonSlot != null

  return (
    <span className="relative inline-block">
      {showAboveRow && (
        <span className="absolute -top-3 left-0 right-0 flex justify-between items-center z-10 pointer-events-none [&_button]:pointer-events-auto">
          <span className="text-[10px] text-gray-400 font-mono">
            {sentenceNumLabel != null ? (
              onReorderClick ? (
                <button
                  type="button"
                  className="hover:text-blue-600 hover:underline focus:outline-none bg-transparent border-0 p-0 cursor-pointer"
                  title="Click to reorder"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReorderClick(e)
                  }}
                >
                  {sentenceNumLabel}
                </button>
              ) : (
                sentenceNumLabel
              )
            ) : null}
          </span>
          {showStarAndMoon && (
            <span className="flex items-center gap-0.5 [&_button]:text-xs [&_button]:w-[1em] [&_button]:h-[1em] [&_button]:flex [&_button]:items-center [&_button]:justify-center">
              {patternStarProps ? (
                <button
                  type="button"
                  className="hover:opacity-80 focus:outline-none bg-transparent border-0 p-0 cursor-pointer"
                  title={patternStarProps.title}
                  onClick={(e) => {
                    e.stopPropagation()
                    patternStarProps.onClick()
                  }}
                >
                  {patternStarProps.isPartial ? (
                    <span className="relative inline-block w-[1em] overflow-hidden">
                      <span className="text-gray-300">★</span>
                      <span className="absolute left-0 top-0 text-amber-500 overflow-hidden" style={{ width: '50%' }}>
                        ★
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-500">★</span>
                  )}
                </button>
              ) : (
                <span className="text-gray-300" title="No matching sentence pattern">★</span>
              )}
              {phraseButtonSlot}
            </span>
          )}
        </span>
      )}
      <span className="inline">
      {tokens.map((token, i) => {
        const run = runByStart.get(i)
        if (run) {
          const chunkTokens = tokens.slice(run.start, run.end)
          const firstPosId = chunkTokens[0]?.pos_type_id ?? null
          const lastPosId = chunkTokens[chunkTokens.length - 1]?.pos_type_id ?? null
          const leftEndConfig = getConfig(firstPosId, 'left')
          const meetingRightConfig = getConfig(firstPosId, 'right')
          const meetingLeftConfig = getConfig(lastPosId, 'left')
          const rightEndConfig = getConfig(lastPosId, 'right')
          const derivedConfigs: ChunkConnectorConfigs = {
            leftEnd: leftEndConfig ?? connectorConfigs?.leftEnd,
            meetingRight: meetingRightConfig ?? connectorConfigs?.meetingRight,
            meetingLeft: meetingLeftConfig ?? connectorConfigs?.meetingLeft,
            rightEnd: rightEndConfig ?? connectorConfigs?.rightEnd,
          }
          return (
            <span key={i}>
              <TokenChunkInternal
                tokens={chunkTokens}
                startIndex={run.start}
                posTypes={posTypes}
                sentenceId={sentenceId}
                onWordClick={onWordClick}
                onWordHover={onWordHover}
                onWordHoverEnd={onWordHoverEnd}
                connectorConfigs={derivedConfigs}
                kiwahaSelectionIndices={kiwahaSelectionIndices}
              />
              {run.end < tokens.length && !isPunctuationOnlyToken(tokens[run.end]) ? ' ' : ''}
            </span>
          )
        }
        if (inRun.has(i)) return null
        const resolved = resolveToken(token, posTypes)
        const inKiwahaSelect = kiwahaSelectionIndices?.has(i)
        const wordEl = (
          <TokenWord
            text={token.text ?? ''}
            underlineColor={resolved.underlineColor}
            interactive={interactive}
            title={resolved.posLabel || (interactive ? 'Click to set POS' : undefined)}
            onClick={(e) => onWordClick(sentenceId, i, token.text ?? '', e)}
          />
        )
        const kiwahaWrapped = inKiwahaSelect ? (
          <span className="ring-2 ring-amber-400/80 rounded">{wordEl}</span>
        ) : (
          wordEl
        )
        const wrapper =
          onWordHover && onWordHoverEnd ? (
            <span onMouseEnter={(e) => onWordHover(sentenceId, i, e)} onMouseLeave={onWordHoverEnd}>
              {kiwahaWrapped}
            </span>
          ) : (
            kiwahaWrapped
          )
        return (
          <span key={i} className="inline">
            {wrapper}
            {i < tokens.length - 1 && !isPunctuationOnlyToken(tokens[i + 1]) ? ' ' : ''}
          </span>
        )
      })}
      </span>
    </span>
  )
}
