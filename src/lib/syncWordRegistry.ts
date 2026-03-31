/**
 * Syncs word_registry from all tagged tokens in story_sentences and image_tags.
 * Backfills any words that were tagged but not saved (e.g. due to prior bugs).
 */

import { supabase } from './supabase'
import { stripPunctuationFromWord } from './tokens'
import type { SentenceToken } from '../db/schema'

type PosTypeEntry = { pos_type_id: number; code: string }

async function upsertWord(
  wordText: string,
  posTypeId: number,
  posCode: string,
  language = 'mi'
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('word_registry')
    .select('pos_types')
    .eq('word_text', wordText)
    .maybeSingle()
  if (fetchError) throw fetchError

  const newEntry: PosTypeEntry = { pos_type_id: posTypeId, code: posCode }
  if (!existing) {
    const { error: insertError } = await supabase.from('word_registry').insert({
      word_text: wordText,
      pos_types: [newEntry],
      language,
    })
    if (insertError) throw insertError
    return
  }
  const posTypes = (existing.pos_types ?? []) as PosTypeEntry[]
  if (posTypes.some((p) => p.pos_type_id === posTypeId)) return
  const { error: updateError } = await supabase
    .from('word_registry')
    .update({ pos_types: [...posTypes, newEntry] })
    .eq('word_text', wordText)
  if (updateError) throw updateError
}

export async function syncWordRegistryFromStories(): Promise<{ synced: number }> {
  const { data: posTypes } = await supabase.from('pos_types').select('id, code')
  const posById = new Map((posTypes ?? []).map((p) => [p.id, p.code]))
  let synced = 0

  const processTokens = async (tokens: SentenceToken[]) => {
    for (const t of tokens) {
      if (t.pos_type_id == null) continue
      const code = posById.get(t.pos_type_id)
      if (!code) continue
      const wordText = stripPunctuationFromWord(String(t.text ?? '').trim())
      if (!wordText) continue
      await upsertWord(wordText, t.pos_type_id, code)
      synced++
    }
  }

  const { data: sentences } = await supabase
    .from('story_sentences')
    .select('tokens_array')
    .limit(10000)
  for (const row of sentences ?? []) {
    const arr = row.tokens_array
    if (!Array.isArray(arr)) continue
    await processTokens(arr as SentenceToken[])
  }

  const { data: tags } = await supabase
    .from('image_tags')
    .select('tokens_array')
    .limit(10000)
  for (const row of tags ?? []) {
    const arr = row.tokens_array
    if (!Array.isArray(arr)) continue
    await processTokens(arr as SentenceToken[])
  }

  return { synced }
}
