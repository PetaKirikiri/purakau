/**
 * Centralized token creation and POS resolution.
 * Single source of truth for token creation and resolved token view models.
 */

import { isValidTokenColor } from './tokenStyling'
import type { SentenceToken } from '../db/schema'

export type PosTypeLike = { id: number; label?: string; color?: string | null }

export type ResolvedToken = {
  token: SentenceToken
  posLabel: string
  underlineColor: string | undefined
}

const PUNCT_ONLY_SENTENCE = /^[.,;:!?'"()[\]{}–—…\s]*$/

/** Splits only on full stop (.). No other punctuation constitutes a sentence boundary. */
/** Punctuation-only fragments (e.g. trailing ") are merged into the previous sentence. */
export function splitIntoSentences(text: string): string[] {
  const raw = text
    .split(/(?<=\.)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (raw.length <= 1) return raw
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const part = raw[i]
    if (PUNCT_ONLY_SENTENCE.test(part) && out.length > 0) {
      out[out.length - 1] = out[out.length - 1] + (part ? ' ' + part : '')
      continue
    }
    out.push(part)
  }
  return out
}

/** Splits on comma and period for structure recognition. "texta, textb." → ["texta,", "textb."] */
export function splitIntoSegments(text: string): string[] {
  const raw = (text ?? '')
    .trim()
    .split(/(?<=[,.])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (raw.length <= 1) return raw
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const part = raw[i]
    if (PUNCT_ONLY_SENTENCE.test(part) && out.length > 0) {
      out[out.length - 1] = out[out.length - 1] + (part ? ' ' + part : '')
      continue
    }
    out.push(part)
  }
  return out
}

/** True if token text is punctuation/whitespace/special-char only (exclude from pattern matching). */
export function isPunctuationOnlyToken(token: { text?: string | null }): boolean {
  const t = String(token.text ?? '').trim()
  return !t || /^[.,;:!?'"()[\]{}–—…\u2018\u2019\u201C\u201D\s]+$/.test(t)
}
/** Punctuation only (no spaces) for word_registry. Includes curly quotes \u201C\u201D\u2018\u2019. */
const PUNCT_STRIP_WORD = /[.,;:!?"()[\]{}–—…\u2018\u2019\u201C\u201D]+/g

/** Strips punctuation from a single word. Lowercases for canonical form. Used for word_registry. Keeps spaces. */
export function stripPunctuationFromWord(text: string): string {
  return String(text ?? '').replace(PUNCT_STRIP_WORD, '').trim().toLowerCase()
}

/** Canonical key for word_registry / frequency matching (DB trigger strips punct + whitespace). */
export function normalizeWordRegistryKey(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?"()[\]{}–—…\u2018\u2019\u201C\u201D\s]+/g, '')
}

/** Fold long vowels after lowercase + NFC so "māua" matches "maua" and vice versa. */
function foldMacronsForSearch(s: string): string {
  return s
    .replace(/ā/g, 'a')
    .replace(/ē/g, 'e')
    .replace(/ī/g, 'i')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
}

/**
 * Case-insensitive substring search for vocabulary fields: Unicode NFC, then macron-folded fallback.
 */
export function vocabularySearchMatches(wordText: string, searchInput: string): boolean {
  const needle = String(searchInput ?? '').trim().toLowerCase().normalize('NFC')
  if (!needle) return true
  const hay = String(wordText ?? '').toLowerCase().normalize('NFC')
  if (hay.includes(needle)) return true
  return foldMacronsForSearch(hay).includes(foldMacronsForSearch(needle))
}

/** Whole-word equality for search pinning (NFC + macron fold fallback), not substring. */
export function vocabularySearchExactMatch(wordText: string, searchInput: string): boolean {
  const n = String(searchInput ?? '').trim().toLowerCase().normalize('NFC')
  if (!n) return false
  const w = String(wordText ?? '').toLowerCase().normalize('NFC')
  if (w === n) return true
  return foldMacronsForSearch(w) === foldMacronsForSearch(n)
}

/** Strips all punctuation/special chars from token text. Filters out punctuation-only tokens. Used for image tag labels from dragged chunks. */
const PUNCT_STRIP_FULL = /[.,;:!?'"()[\]{}–—…\u2018\u2019\u201C\u201D\s]+/g
export function stripPunctuationFromTokens(tokens: SentenceToken[]): SentenceToken[] {
  const out: SentenceToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const cleaned = String(t.text ?? '').replace(PUNCT_STRIP_FULL, '').trim()
    if (!cleaned) continue
    out.push({ ...t, text: cleaned, index: out.length + 1 })
  }
  return out
}

/**
 * Merges POS data from old tokens into new tokens by matching normalized word form.
 * Preserves pos_type_id and word_pos_entry_id when the canonical word matches (handles case changes, e.g. Ka→ka).
 */
export function mergeTokenPos(
  oldTokens: SentenceToken[],
  newTokens: SentenceToken[]
): SentenceToken[] {
  const used = new Set<number>()
  return newTokens.map((t, i) => {
    const norm = stripPunctuationFromWord(String(t.text ?? '').trim())
    if (!norm) return { ...t, index: i + 1 }
    const idx = oldTokens.findIndex(
      (o, j) =>
        !used.has(j) &&
        stripPunctuationFromWord(String(o.text ?? '').trim()) === norm
    )
    if (idx >= 0) {
      used.add(idx)
      const old = oldTokens[idx]
      return {
        ...t,
        index: i + 1,
        pos_type_id: old.pos_type_id,
        word_pos_entry_id: old.word_pos_entry_id,
      }
    }
    return { ...t, index: i + 1 }
  })
}

/** Tokenize without merging punctuation onto words. Punctuation stays as separate tokens. */
export function getTokensFromSentence(sentenceText: string): SentenceToken[] {
  const parts = (sentenceText ?? '')
    .split(/(\s+)/)
    .filter((p: string) => !/^\s+$/.test(p))
  return parts.map((text: string, i: number) => ({
    index: i + 1,
    text,
    pos_type_id: null,
    word_pos_entry_id: null,
  }))
}

export type SentenceLike = { tokens_array?: unknown; sentence_text?: string }

/** Returns tokens for a specific segment within a row, preserving POS from tokens_array. */
export function getTokensForSegment(s: SentenceLike, segmentIndex: number): SentenceToken[] {
  return getTokensForSegmentWithSplitter(s, segmentIndex, splitIntoSentences)
}

/** Returns tokens for segment when splitting on comma or period (for structure recognition). */
export function getTokensForSegmentByCommaOrPeriod(s: SentenceLike, segmentIndex: number): SentenceToken[] {
  return getTokensForSegmentWithSplitter(s, segmentIndex, splitIntoSegments)
}

function getTokensForSegmentWithSplitter(
  s: SentenceLike,
  segmentIndex: number,
  splitter: (text: string) => string[]
): SentenceToken[] {
  const tokens = getTokensForSentence(s)
  const text = (Array.isArray(s.tokens_array) && s.tokens_array.length > 0)
    ? getTextFromTokens(s)
    : (s.sentence_text ?? '').trim()
  const segments = splitter(text)
  if (segmentIndex >= segments.length) return []
  const target = segments[segmentIndex]
  let segIdx = 0
  let segAcc = ''
  const result: SentenceToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const tokenText = String(t.text ?? '').trim()
    const next = tokens[i + 1]
    const addSpace = next && !isPunctuationOnlyToken(next)
    segAcc += tokenText + (addSpace ? ' ' : '')
    if (segIdx < segmentIndex) {
      if (segAcc.trim() === segments[segIdx]) {
        segIdx++
        segAcc = ''
      }
      continue
    }
    if (segIdx === segmentIndex) {
      result.push(t)
      if (segAcc.trim() === target) return result
    }
  }
  return result
}

export function getTokensForSentence(s: SentenceLike): SentenceToken[] {
  const arr = s.tokens_array
  if (Array.isArray(arr) && arr.length > 0) return arr as SentenceToken[]
  return getTokensFromSentence(s.sentence_text ?? '')
}

/** Splits token array by period (.) boundaries. Returns segments with reindexed tokens. */
export function splitTokensIntoSentences(tokens: SentenceToken[]): SentenceToken[][] {
  const segments: SentenceToken[][] = []
  let current: SentenceToken[] = []
  for (const t of tokens) {
    const text = String(t.text ?? '').trim()
    if (text === '.' && current.length > 0) {
      current.push({ ...t, index: current.length + 1 })
      segments.push(current)
      current = []
    } else {
      current.push({ ...t, index: current.length + 1 })
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/** Joins token text to get the full row content. No space before punctuation. */
export function getTextFromTokens(s: SentenceLike): string {
  const tokens = getTokensForSentence(s)
  return tokens
    .map((t, i) => {
      const text = t.text ?? ''
      const next = tokens[i + 1]
      const nextIsPunct = next && isPunctuationOnlyToken(next)
      return text + (nextIsPunct || !next ? '' : ' ')
    })
    .join('')
}

export type ImageTagLike = {
  id?: number
  x: number
  y: number
  sort_order?: number
  sentence_text?: string | null
  tokens_array?: SentenceToken[] | null
  /** @deprecated Use tokens_array */
  text?: string
  /** @deprecated Use tokens_array */
  tokens?: SentenceToken[]
}

/** Returns tokens for an image tag. Uses tokens_array (same layout as story_sentences). */
export function getTokensFromImageTag(tag: ImageTagLike): { x: number; y: number; tokens: SentenceToken[] } {
  const arr = tag.tokens_array ?? tag.tokens
  if (Array.isArray(arr) && arr.length > 0) {
    return { x: tag.x, y: tag.y, tokens: arr }
  }
  const text = (tag.sentence_text ?? tag.text ?? '').trim()
  const tokens = getTokensFromSentence(text)
  return { x: tag.x, y: tag.y, tokens }
}

export function resolveToken(token: SentenceToken, posTypes: PosTypeLike[]): ResolvedToken {
  const pos = token.pos_type_id != null ? posTypes.find((p) => p.id === token.pos_type_id) : null
  const posLabel = pos?.label ?? ''
  const underlineColor = isValidTokenColor(pos?.color) ? pos!.color! : undefined
  return { token, posLabel, underlineColor }
}
