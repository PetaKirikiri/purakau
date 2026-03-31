/**
 * Build picture-question token arrays from a tagged sentence and a sentence pattern
 * with question_config (slot / span + conditional interrogative templates).
 */

import type {
  PatternQuestionConfig,
  PatternQuestionVariant,
  PatternQuestionWhen,
  SentencePatternPhraseComponent,
  SentenceToken,
} from '../db/schema'
import { getTokensFromSentence, isPunctuationOnlyToken } from './tokens'

export type PatternRowForGeneration = {
  id: number
  pos_blueprint: number[]
  phrase_components?: SentencePatternPhraseComponent[] | null
  question_config: PatternQuestionConfig | null
}

function normalizeMatchText(s: string): string {
  return s.trim().toLowerCase()
}

/** Nth content token (non-punctuation) → index in full tokens array. */
export function contentIndexForBlueprintSlot(tokens: SentenceToken[], slotIndex: number): number | null {
  const contentIndices: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!isPunctuationOnlyToken(tokens[i])) contentIndices.push(i)
  }
  if (slotIndex < 0 || slotIndex >= contentIndices.length) return null
  return contentIndices[slotIndex]!
}

/**
 * Inclusive content ordinals → first and last token indices in tokens[] (includes punct between those content tokens).
 */
export function contentSpanToTokenRange(
  tokens: SentenceToken[],
  startOrdinal: number,
  endOrdinalInclusive: number
): { start: number; end: number } | null {
  if (startOrdinal > endOrdinalInclusive || startOrdinal < 0) return null
  const startTok = contentIndexForBlueprintSlot(tokens, startOrdinal)
  const endTok = contentIndexForBlueprintSlot(tokens, endOrdinalInclusive)
  if (startTok == null || endTok == null || endTok < startTok) return null
  return { start: startTok, end: endTok }
}

function blueprintMatchesTokens(tokens: SentenceToken[], posBlueprint: number[]): boolean {
  const blueprint = tokens
    .filter((t) => !isPunctuationOnlyToken(t))
    .map((t) => t.pos_type_id)
    .filter((id): id is number => id != null)
  const b = posBlueprint.filter((id): id is number => id != null)
  return b.length === blueprint.length && b.length > 0 && b.every((v, i) => v === blueprint[i])
}

/**
 * Prefer patterns that have question_config; otherwise first blueprint match.
 */
export function findMatchingPatternForGeneration(
  tokens: SentenceToken[],
  patterns: PatternRowForGeneration[]
): PatternRowForGeneration | null {
  const withConfig = patterns.filter((p) => p.question_config?.variants?.length)
  for (const p of withConfig) {
    if (blueprintMatchesTokens(tokens, p.pos_blueprint)) return p
  }
  for (const p of patterns) {
    if (blueprintMatchesTokens(tokens, p.pos_blueprint)) return p
  }
  return null
}

function reindexTokens(tokens: SentenceToken[]): SentenceToken[] {
  return tokens.map((t, i) => ({ ...t, index: i + 1 }))
}

function phraseContainsFocus(
  components: SentencePatternPhraseComponent[] | null | undefined,
  phraseName: string,
  focusContentOrdinal: number
): boolean {
  if (!components?.length) return false
  for (const pc of components) {
    if (pc.pattern_name !== phraseName) continue
    // phrase_components use [start, end) half-open in content ordinal space
    if (focusContentOrdinal >= pc.start && focusContentOrdinal < pc.end) return true
  }
  return false
}

/**
 * @param focusContentOrdinal — replace_span.start or slot_index; used for in_phrase_name.
 */
export function evaluateWhen(
  tokens: SentenceToken[],
  when: PatternQuestionWhen | undefined,
  phraseComponents: SentencePatternPhraseComponent[] | null | undefined,
  focusContentOrdinal: number
): boolean {
  if (!when) return true

  if (when.in_phrase_name) {
    if (!phraseContainsFocus(phraseComponents, when.in_phrase_name, focusContentOrdinal)) return false
  }

  if (when.slot_pos?.length) {
    for (const { slot, pos_type_id } of when.slot_pos) {
      const idx = contentIndexForBlueprintSlot(tokens, slot)
      if (idx == null) return false
      if (tokens[idx]!.pos_type_id !== pos_type_id) return false
    }
  }

  if (when.slot_text?.length) {
    for (const { slot, text } of when.slot_text) {
      const want = normalizeMatchText(text)
      if (!want) continue
      const idx = contentIndexForBlueprintSlot(tokens, slot)
      if (idx == null) return false
      if (normalizeMatchText(tokens[idx]!.text ?? '') !== want) return false
    }
  }

  return true
}

/**
 * Replace the token at slotTokenIndex with tokenized variant text; supports multi-token variants.
 */
export function applyVariantAtSlot(
  sourceTokens: SentenceToken[],
  slotTokenIndex: number,
  variantText: string
): SentenceToken[] {
  const inserted = getTokensFromSentence(variantText.trim())
  if (inserted.length === 0) return reindexTokens([...sourceTokens])
  const before = sourceTokens.slice(0, slotTokenIndex)
  const after = sourceTokens.slice(slotTokenIndex + 1)
  const merged = [...before, ...inserted, ...after]
  return reindexTokens(merged)
}

/** Inclusive token indices in sourceTokens. */
export function applyVariantAtSpan(
  sourceTokens: SentenceToken[],
  startTokenIndex: number,
  endTokenIndexInclusive: number,
  variantText: string
): SentenceToken[] {
  if (endTokenIndexInclusive < startTokenIndex) return reindexTokens([...sourceTokens])
  const inserted = getTokensFromSentence(variantText.trim())
  if (inserted.length === 0) return reindexTokens([...sourceTokens])
  const before = sourceTokens.slice(0, startTokenIndex)
  const after = sourceTokens.slice(endTokenIndexInclusive + 1)
  const merged = [...before, ...inserted, ...after]
  return reindexTokens(merged)
}

function focusContentOrdinal(cfg: PatternQuestionConfig): number {
  if (cfg.replace_span) return cfg.replace_span.start
  return cfg.slot_index
}

/** Focus ordinal for in_phrase checks: variant overrides config. */
function effectiveFocusOrdinal(v: PatternQuestionVariant, cfg: PatternQuestionConfig): number {
  if (v.replace_span) return v.replace_span.start
  if (v.slot_index != null) return v.slot_index
  return focusContentOrdinal(cfg)
}

function effectiveTokenRange(
  v: PatternQuestionVariant,
  cfg: PatternQuestionConfig,
  tokens: SentenceToken[]
): { start: number; end: number } | null {
  if (v.replace_span) {
    const r = contentSpanToTokenRange(tokens, v.replace_span.start, v.replace_span.end)
    if (r) return r
  }
  if (v.slot_index != null) {
    const idx = contentIndexForBlueprintSlot(tokens, v.slot_index)
    if (idx != null) return { start: idx, end: idx }
  }
  if (cfg.replace_span) {
    const r = contentSpanToTokenRange(tokens, cfg.replace_span.start, cfg.replace_span.end)
    if (r) return r
  }
  const idx = contentIndexForBlueprintSlot(tokens, cfg.slot_index)
  return idx != null ? { start: idx, end: idx } : null
}

/**
 * One token array per variant that passes `when` and has non-empty text. Skips if span/slot invalid or no match.
 */
export function generatePageMediaQuestionTokenArrays(
  sourceTokens: SentenceToken[],
  pattern: PatternRowForGeneration
): SentenceToken[][] {
  const cfg = pattern.question_config
  if (!cfg?.variants?.length) return []
  if (!blueprintMatchesTokens(sourceTokens, pattern.pos_blueprint)) return []

  const components = pattern.phrase_components ?? []

  const out: SentenceToken[][] = []
  for (const v of cfg.variants) {
    const t = (v.text ?? '').trim()
    if (!t) continue
    const focusOrd = effectiveFocusOrdinal(v, cfg)
    if (!evaluateWhen(sourceTokens, v.when, components, focusOrd)) continue
    const spanRange = effectiveTokenRange(v, cfg, sourceTokens)
    if (spanRange == null) continue
    out.push(applyVariantAtSpan(sourceTokens, spanRange.start, spanRange.end, t))
  }
  return out
}
