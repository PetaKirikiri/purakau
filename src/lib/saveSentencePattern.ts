/**
 * Extracts sentence structure (POS blueprint + phrase components) and saves as a sentence pattern.
 */

import { getTokensForSegment, getTokensForSentence, splitIntoSentences, isPunctuationOnlyToken } from './tokens'
import { findPatternRunsWithNames } from './patternMatch'
import { supabase } from './supabase'

export type PhraseComponent = { pattern_id: number; pattern_name: string; start: number; end: number }

export type ExtractedStructure = {
  posBlueprint: number[]
  phraseComponents: PhraseComponent[]
  /** One surface string per pos_blueprint slot (same token order). */
  contentWords: string[]
}

export type PatternWithId = { id: number; name: string; sequence: number[] }

/**
 * Extracts two-level blueprint from a sentence:
 * - posBlueprint: sequence of pos_type_ids (bottom level)
 * - phraseComponents: phrase patterns that matched (upper level)
 */
export function extractSentenceStructure(
  sentence: { tokens_array?: unknown; sentence_text?: string },
  phrasePatterns: PatternWithId[]
): ExtractedStructure | null {
  const segments = splitIntoSentences((sentence.sentence_text ?? '').trim())
  const tokens =
    segments.length > 0
      ? getTokensForSegment(sentence, 0)
      : getTokensForSentence(sentence)
  if (tokens.length === 0) return null

  const posBlueprint: number[] = []
  const contentWords: string[] = []
  for (const t of tokens) {
    if (isPunctuationOnlyToken(t)) continue
    const id = t.pos_type_id
    if (id == null) continue
    posBlueprint.push(id)
    contentWords.push(String(t.text ?? '').trim() || '—')
  }
  if (posBlueprint.length === 0) return null

  const runs = findPatternRunsWithNames(tokens, phrasePatterns)
  const tokenToPosIndex = (i: number) =>
    tokens
      .slice(0, i)
      .filter((t) => !isPunctuationOnlyToken(t)).length
  const phraseComponents = runs.map((r) => ({
    pattern_id: r.patternId,
    pattern_name: r.patternName,
    start: tokenToPosIndex(r.start),
    end: tokenToPosIndex(r.end),
  }))

  return { posBlueprint, phraseComponents, contentWords }
}

export async function saveSentencePattern(
  name: string,
  structure: ExtractedStructure,
  titleId?: number
): Promise<{ id: number }> {
  const { data, error } = await supabase
    .from('sentence_patterns')
    .insert({
      name: name.trim(),
      description: null,
      pos_blueprint: structure.posBlueprint,
      content_words: structure.contentWords,
      phrase_components: structure.phraseComponents,
      title_id: titleId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id }
}
