/**
 * Pattern matching at render time. Finds contiguous token runs that match
 * pos_chunk_patterns sequences. Used to render connected underlines.
 */

import { getTokensForSegment, getTokensForSentence, splitIntoSentences, isPunctuationOnlyToken } from './tokens'
import type { SentenceToken } from '../db/schema'

export type PosPattern = { sequence: number[] }

export type PatternRun = { start: number; end: number }

export type DraggableChunk = {
  sentenceId: number
  start: number
  end: number
  tokens: SentenceToken[]
  patternName: string
}

export type SentenceLike = { id: number; tokens_array?: unknown; sentence_text?: string }

/**
 * Finds all pattern chunks for drag-to-image. Processes each logical segment
 * separately (splits on full stop). Deduplicates by span so the same chunk is
 * not shown twice when multiple patterns match.
 */
export function findDraggableChunks(
  sentences: SentenceLike[],
  patterns: { name?: string; sequence?: number[] }[]
): DraggableChunk[] {
  const allowed = patterns.filter(
    (p) => Array.isArray(p.sequence) && p.sequence.length >= 2
  )
  if (allowed.length === 0) return []

  const seen = new Set<string>()
  const chunks: DraggableChunk[] = []

  for (const sent of sentences) {
    const segments = splitIntoSentences((sent.sentence_text ?? '').trim())
    const segmentCount = segments.length > 0 ? segments.length : 1

    for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
      const tokens =
        segments.length > 0 ? getTokensForSegment(sent, segIdx) : getTokensForSentence(sent)
      if (tokens.length === 0) continue

      for (let i = 0; i < tokens.length; i++) {
        for (const { name, sequence } of allowed) {
          const seq = sequence!
          if (i + seq.length > tokens.length) continue
          const slice = tokens.slice(i, i + seq.length)
          const hasPunct = slice.some(isPunctuationOnlyToken)
          if (hasPunct) continue
          const allHavePos = slice.every((t) => t.pos_type_id != null)
          if (!allHavePos) continue
          const tokenIds = slice.map((t) => t.pos_type_id!)
          if (!tokenIds.every((id, j) => id === seq[j])) continue

          const key = `${sent.id}:${segIdx}:${i}:${i + seq.length}`
          if (seen.has(key)) continue
          seen.add(key)

          chunks.push({
            sentenceId: sent.id,
            start: i,
            end: i + seq.length,
            tokens: [...slice],
            patternName: name ?? '',
          })
        }
      }
    }
  }
  return chunks
}

/**
 * Returns non-overlapping pattern runs. Greedy longest-match: at each position,
 * try the longest pattern first; if it matches, consume those tokens and continue.
 */
export function findPatternRuns(
  tokens: SentenceToken[],
  patterns: PosPattern[]
): PatternRun[] {
  const runs: PatternRun[] = []
  const sequences = patterns
    .filter((p) => Array.isArray(p.sequence) && p.sequence.length >= 2)
    .map((p) => p.sequence)
    .sort((a, b) => b.length - a.length)

  let i = 0
  while (i < tokens.length) {
    let matched: { len: number } | null = null
    for (const seq of sequences) {
      if (i + seq.length > tokens.length) continue
      const slice = tokens.slice(i, i + seq.length)
      if (slice.some(isPunctuationOnlyToken)) continue
      const allHavePos = slice.every((t) => t.pos_type_id != null)
      if (!allHavePos) continue
      const tokenIds = slice.map((t) => t.pos_type_id!)
      if (tokenIds.every((id, j) => id === seq[j])) {
        matched = { len: seq.length }
        break
      }
    }
    if (matched) {
      runs.push({ start: i, end: i + matched.len })
      i += matched.len
    } else {
      i += 1
    }
  }
  return runs
}

export type PatternRunWithName = { start: number; end: number; patternId: number; patternName: string }

export type PatternWithId = { id: number; name: string; sequence: number[]; shapeConfig?: unknown }

/**
 * Returns non-overlapping pattern runs with pattern id and name.
 * Greedy longest-match: at each position, try the longest pattern first.
 */
export function findPatternRunsWithNames(
  tokens: SentenceToken[],
  patterns: PatternWithId[]
): PatternRunWithName[] {
  const runs: PatternRunWithName[] = []
  const sorted = [...patterns]
    .filter((p) => Array.isArray(p.sequence) && p.sequence.length >= 2)
    .sort((a, b) => b.sequence.length - a.sequence.length)

  let i = 0
  while (i < tokens.length) {
    let matched: { len: number; patternId: number; patternName: string } | null = null
    for (const p of sorted) {
      const seq = p.sequence
      if (i + seq.length > tokens.length) continue
      const slice = tokens.slice(i, i + seq.length)
      if (slice.some(isPunctuationOnlyToken)) continue
      const allHavePos = slice.every((t) => t.pos_type_id != null)
      if (!allHavePos) continue
      const tokenIds = slice.map((t) => t.pos_type_id!)
      if (tokenIds.every((id, j) => id === seq[j])) {
        matched = { len: seq.length, patternId: p.id, patternName: p.name ?? '' }
        break
      }
    }
    if (matched) {
      runs.push({
        start: i,
        end: i + matched.len,
        patternId: matched.patternId,
        patternName: matched.patternName,
      })
      i += matched.len
    } else {
      i += 1
    }
  }
  return runs
}
