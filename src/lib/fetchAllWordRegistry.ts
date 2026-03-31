import { supabase } from './supabase'

/** Bumped when select shape changes so stale cache is not reused (e.g. added frequency_rank). */
export const WORD_REGISTRY_FULL_LIST_QUERY_KEY = ['word_registry', 'fullList'] as const

const PAGE = 1000
/** Safety valve: abnormal API behaviour could otherwise loop forever. */
const MAX_REGISTRY_PAGES = 50_000

export type FrequencyPairFromRegistry = { rank: number; word: string }

/** Rows with a set frequency_rank, ordered by rank then word_text (stable for paging). */
export async function fetchFrequencyPairsFromRegistry(): Promise<FrequencyPairFromRegistry[]> {
  let from = 0
  const out: FrequencyPairFromRegistry[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('word_registry')
      .select('word_text, frequency_rank')
      .not('frequency_rank', 'is', null)
      .order('frequency_rank', { ascending: true })
      .order('word_text', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = (data ?? []) as { word_text: string; frequency_rank: unknown }[]
    for (const r of chunk) {
      const rank = Number(r.frequency_rank)
      const word = String(r.word_text ?? '')
      if (!Number.isFinite(rank) || !word) continue
      out.push({ rank, word })
    }
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return out
}

/** Full table scan in pages — avoids PostgREST default max-rows (~1000) truncating results. */
export async function fetchAllRegistryWordTexts(): Promise<Set<string>> {
  let from = 0
  const set = new Set<string>()
  for (;;) {
    const { data, error } = await supabase
      .from('word_registry')
      .select('word_text')
      .order('word_text')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = data ?? []
    for (const r of chunk) set.add(String((r as { word_text: string }).word_text))
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return set
}

export type WordRegistryPosRow = {
  word_text: string
  pos_types: unknown
  /** Lower = more frequent when set; null/omitted if not ranked. */
  frequency_rank?: number | null
}

/**
 * Sort key: lower rank first (more common). Missing rank sorts last.
 * Tie-break: word_text (base locale).
 */
export function compareByFrequencyRankThenWordText(
  wordA: string,
  rankA: number | null | undefined,
  wordB: string,
  rankB: number | null | undefined
): number {
  const na = rankA != null && Number.isFinite(Number(rankA)) ? Math.trunc(Number(rankA)) : null
  const nb = rankB != null && Number.isFinite(Number(rankB)) ? Math.trunc(Number(rankB)) : null
  if (na != null && nb != null && na !== nb) return na - nb
  if (na != null && nb == null) return -1
  if (na == null && nb != null) return 1
  return wordA.localeCompare(wordB, undefined, { sensitivity: 'base' })
}

export async function fetchAllRegistryWordsWithPos(): Promise<WordRegistryPosRow[]> {
  let from = 0
  let pages = 0
  const out: WordRegistryPosRow[] = []
  for (;;) {
    if (++pages > MAX_REGISTRY_PAGES) {
      throw new Error(
        `word_registry paging exceeded ${MAX_REGISTRY_PAGES} pages — check Supabase/PostgREST range responses.`
      )
    }
    const { data, error } = await supabase
      .from('word_registry')
      .select('word_text, pos_types, frequency_rank')
      .order('word_text')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = (data ?? []) as WordRegistryPosRow[]
    out.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return out
}
