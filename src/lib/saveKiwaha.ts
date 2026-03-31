import { supabase } from './supabase'
import { mergeTokensAndSetPos } from './saveTokenPos'

export type SaveKiwahaResult =
  | { ok: true; kiwahaId: number; phraseText: string }
  | { ok: false; error: string }

const KIWHA_POS_CODE = 'KIWHA'

/**
 * Saves a kīwaha: merges tokens to one POS=Kīwaha (same as POS merge + Words), then
 * records the kīwaha row + instance.
 */
export async function saveKiwaha(
  sentenceId: number,
  tokenStart: number,
  tokenEnd: number,
  versionId: number | null,
  meaning?: string
): Promise<SaveKiwahaResult> {
  const { data: posRow, error: posErr } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('code', KIWHA_POS_CODE)
    .maybeSingle()
  if (posErr || !posRow) {
    return { ok: false, error: 'Kīwaha POS type missing (run migration seed_kiwaha_pos_type)' }
  }

  const mergeResult = await mergeTokensAndSetPos(sentenceId, tokenStart, tokenEnd, posRow.id)
  if (!mergeResult.ok) return { ok: false, error: mergeResult.error }

  const phraseText = String(mergeResult.token.text ?? '').trim()
  if (!phraseText) return { ok: false, error: 'Phrase text is empty' }

  const mergedIdx = tokenStart

  const { data: kiwahaRow, error: insErr } = await supabase
    .from('kiwaha')
    .insert({ phrase_text: phraseText, meaning: meaning ?? null, version_id: versionId })
    .select('id')
    .single()

  if (insErr || !kiwahaRow) return { ok: false, error: insErr?.message ?? 'Failed to create kīwaha' }

  const { error: instErr } = await supabase.from('kiwaha_instances').insert({
    kiwaha_id: kiwahaRow.id,
    sentence_id: sentenceId,
    token_start: mergedIdx,
    token_end: mergedIdx,
  })

  if (instErr) return { ok: false, error: instErr.message }
  return { ok: true, kiwahaId: kiwahaRow.id, phraseText }
}
