import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWordRegistryKey } from './tokens'

const CHUNK = 150
const UPDATE_PARALLEL = 25

export type FrequencyRankPair = { rank: number; word: string }

/** Normalized key → best (minimum) rank, matching import frequency mergeToBestRank. */
export function buildFrequencyRankMap(pairs: FrequencyRankPair[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const { rank, word } of pairs) {
    const k = normalizeWordRegistryKey(word)
    if (!k) continue
    const prev = m.get(k)
    if (prev == null || rank < prev) m.set(k, rank)
  }
  return m
}

export async function fetchExistingRegistryRanksForKeys(
  client: SupabaseClient,
  keys: string[]
): Promise<Map<string, number | null>> {
  const m = new Map<string, number | null>()
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK)
    const { data, error } = await client
      .from('word_registry')
      .select('word_text, frequency_rank')
      .in('word_text', chunk)
    if (error) throw error
    for (const row of data ?? []) {
      m.set(String(row.word_text), row.frequency_rank as number | null)
    }
  }
  return m
}

export function computeSyncPreview(
  rankMap: Map<string, number>,
  existingMap: Map<string, number | null>
): { insert: number; updateRank: number; skip: number } {
  let insert = 0
  let updateRank = 0
  let skip = 0
  for (const [key, rank] of rankMap) {
    const ex = existingMap.get(key)
    if (ex === undefined) insert++
    else if (ex !== rank) updateRank++
    else skip++
  }
  return { insert, updateRank, skip }
}

export type SyncFrequencyToRegistryResult = {
  inserted: number
  updatedRank: number
  skipped: number
  failed: number
  errors: string[]
}

type InsertRow = {
  word_text: string
  pos_types: []
  metadata: Record<string, never>
  language: string
  frequency_rank: number
}

export async function syncFrequencyListToWordRegistry(
  client: SupabaseClient,
  pairs: FrequencyRankPair[]
): Promise<SyncFrequencyToRegistryResult> {
  const rankMap = buildFrequencyRankMap(pairs)
  const keys = [...rankMap.keys()]
  const existingMap = await fetchExistingRegistryRanksForKeys(client, keys)

  const toInsert: InsertRow[] = []
  const toUpdate: { word_text: string; frequency_rank: number }[] = []
  let skipped = 0

  for (const [key, rank] of rankMap) {
    const ex = existingMap.get(key)
    if (ex === undefined) {
      toInsert.push({
        word_text: key,
        pos_types: [],
        metadata: {},
        language: 'mi',
        frequency_rank: rank,
      })
    } else if (ex !== rank) {
      toUpdate.push({ word_text: key, frequency_rank: rank })
    } else {
      skipped++
    }
  }

  let inserted = 0
  let updatedRank = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const batch = toInsert.slice(i, i + CHUNK)
    const { error } = await client.from('word_registry').insert(batch)
    if (!error) {
      inserted += batch.length
      continue
    }
    for (const row of batch) {
      const { error: e1 } = await client.from('word_registry').insert(row)
      if (!e1) {
        inserted++
        continue
      }
      if (e1.code === '23505') {
        const { error: e2 } = await client
          .from('word_registry')
          .update({ frequency_rank: row.frequency_rank })
          .eq('word_text', row.word_text)
        if (e2) {
          failed++
          errors.push(`${row.word_text}: ${e2.message}`)
        } else {
          updatedRank++
        }
      } else {
        failed++
        errors.push(`${row.word_text}: ${e1.message}`)
      }
    }
  }

  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    const slice = toUpdate.slice(i, i + UPDATE_PARALLEL)
    const results = await Promise.all(
      slice.map((u) =>
        client.from('word_registry').update({ frequency_rank: u.frequency_rank }).eq('word_text', u.word_text)
      )
    )
    for (let j = 0; j < results.length; j++) {
      const err = results[j].error
      if (err) {
        failed++
        errors.push(`${slice[j].word_text}: ${err.message}`)
      } else {
        updatedRank++
      }
    }
  }

  return { inserted, updatedRank, skipped, failed, errors }
}
