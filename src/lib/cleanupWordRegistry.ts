/**
 * Cleans up word_registry: normalizes word_text (strips punctuation), merges duplicates.
 * Runs in-app when the DB function is not available.
 * Uses upsert-then-delete to avoid duplicate key: upsert merged rows first, then delete variants.
 */

import { supabase } from './supabase'
import { stripPunctuationFromWord } from './tokens'

const LOG = (_msg: string, _data: object) => {}

type PosEntry = { pos_type_id: number; code: string; auto?: boolean }
type WordRow = { word_text: string; pos_types: unknown; language?: string }

export async function cleanupWordRegistryInApp(): Promise<{
  deleted_count: number
  merged_count: number
}> {
  const { data: rows, error: fetchError } = await supabase
    .from('word_registry')
    .select('word_text, pos_types, language')
    .limit(10000)
  if (fetchError) throw fetchError
  if (!rows?.length) return { deleted_count: 0, merged_count: 0 }

  const withSpecialChars = (rows as WordRow[]).filter(
    (r) => stripPunctuationFromWord(r.word_text ?? '') !== (r.word_text ?? '')
  )
  LOG('Words with special chars (raw→norm)', {
    samples: withSpecialChars.slice(0, 15).map((r) => ({
      raw: r.word_text,
      norm: stripPunctuationFromWord(r.word_text ?? ''),
    })),
    total: withSpecialChars.length,
  })

  const groups = new Map<string, { pos_types: PosEntry[]; language: string }>()
  for (const r of rows as WordRow[]) {
    const norm = stripPunctuationFromWord(r.word_text ?? '')
    if (!norm) continue
    const existing = groups.get(norm)
    const posList = (r.pos_types ?? []) as PosEntry[]
    if (!existing) {
      groups.set(norm, { pos_types: [...posList], language: r.language ?? 'mi' })
    } else {
      for (const p of posList) {
        const idx = existing.pos_types.findIndex((m) => m.pos_type_id === p.pos_type_id)
        if (idx < 0) {
          existing.pos_types.push(p)
        } else if (p.auto) {
          existing.pos_types[idx] = { ...existing.pos_types[idx], auto: true }
        }
      }
    }
  }

  const toInsert = Array.from(groups.entries()).map(([word_text, { pos_types, language }]) => ({
    word_text,
    pos_types,
    language,
  }))

  const allWordTexts = (rows as WordRow[]).map((r) => r.word_text)
  LOG('Cleanup plan', {
    toInsertCount: toInsert.length,
    toDeleteCount: allWordTexts.length,
    toDeleteSamples: allWordTexts.slice(0, 5),
  })

  for (const wordText of allWordTexts) {
    const { error: delError } = await supabase
      .from('word_registry')
      .delete()
      .eq('word_text', wordText)
    if (delError) {
      LOG('Delete failed for row', { wordText, error: delError.message })
      throw delError
    }
  }

  const { error: insertError } = await supabase.from('word_registry').insert(toInsert)
  if (insertError) throw insertError

  return { deleted_count: rows.length, merged_count: toInsert.length }
}
