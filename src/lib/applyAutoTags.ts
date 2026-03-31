/**
 * Applies POS tags to untagged tokens only when the word exists in word_registry
 * with auto=true for that POS type. Words without auto set are never inferred.
 */

import { supabase } from './supabase'
import { stripPunctuationFromWord, getTokensFromSentence } from './tokens'
import type { SentenceToken } from '../db/schema'

type PosEntry = { pos_type_id: number; code: string; auto?: boolean }

export async function applyAutoTagsForStory(
  versionId: number | null,
  titleId?: number
): Promise<{ updated: number; applied: number }> {
  const { data: words, error: wordsError } = await supabase
    .from('word_registry')
    .select('word_text, pos_types')
  if (wordsError) throw wordsError

  const autoMap = new Map<string, number>()
  for (const row of words ?? []) {
    const posList = (row.pos_types ?? []) as PosEntry[]
    for (const p of posList) {
      if (!p.auto) continue
      const norm = stripPunctuationFromWord(row.word_text ?? '')
      if (!norm) continue
      if (!autoMap.has(norm)) autoMap.set(norm, p.pos_type_id)
    }
  }

  let q = supabase.from('story_sentences').select('id, sentence_text, tokens_array')
  if (versionId != null) q = q.eq('version_id', versionId)
  else if (titleId != null) q = q.eq('title_id', titleId)
  else return { updated: 0, applied: 0 }
  const { data: sentences, error: sentError } = await q
  if (sentError) throw sentError
  if (!sentences?.length) return { updated: 0, applied: 0 }

  let applied = 0
  let sentencesUpdated = 0
  for (const row of sentences) {
    let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
    if (tokens.length === 0 && row.sentence_text) {
      tokens = getTokensFromSentence(String(row.sentence_text))
    }
    if (!Array.isArray(tokens) || tokens.length === 0) continue

    let changed = false
    const updated = tokens.map((t) => {
      if (t.pos_type_id != null) return t
      const norm = stripPunctuationFromWord(String(t.text ?? '').trim())
      const posTypeId = norm ? autoMap.get(norm) : undefined
      if (posTypeId == null) return t
      changed = true
      applied++
      return { ...t, pos_type_id: posTypeId }
    })
    if (!changed) continue

    const { error: updError } = await supabase
      .from('story_sentences')
      .update({ tokens_array: updated })
      .eq('id', row.id)
    if (updError) throw updError
    sentencesUpdated++
  }

  return { updated: sentencesUpdated, applied }
}
