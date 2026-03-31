import { normalizeWordRegistryKey } from './tokens'
import type { SentenceToken } from '../db/schema'

export type StoryWordUsageRow = {
  titleId: number
  titleName: string
  count: number
}

/** Count token occurrences per story title; keys match word_registry / frequency normalization. */
export function buildStoryWordUsageByNormKey(
  sentences: { title_id: number | null; tokens_array: unknown }[],
  titleIdToName: Map<number, string>
): Record<string, StoryWordUsageRow[]> {
  const agg = new Map<string, Map<number, number>>()

  for (const row of sentences) {
    const tid = row.title_id
    if (tid == null) continue
    const tokens = row.tokens_array
    if (!Array.isArray(tokens)) continue
    for (const t of tokens) {
      if (!t || typeof t !== 'object') continue
      const text = (t as SentenceToken).text
      if (text == null || String(text).trim() === '') continue
      const key = normalizeWordRegistryKey(String(text))
      if (!key) continue
      if (!agg.has(key)) agg.set(key, new Map())
      const m = agg.get(key)!
      m.set(tid, (m.get(tid) ?? 0) + 1)
    }
  }

  const out: Record<string, StoryWordUsageRow[]> = {}
  for (const [key, titleCounts] of agg) {
    out[key] = [...titleCounts.entries()]
      .map(([titleId, count]) => ({
        titleId,
        titleName: titleIdToName.get(titleId) ?? `Title #${titleId}`,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.titleName.localeCompare(b.titleName, undefined, { sensitivity: 'base' }))
  }
  return out
}
