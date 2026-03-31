import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchFrequencyPairsFromRegistry } from '../lib/fetchAllWordRegistry'
import { formatError } from '../lib/formatError'
import { buildStoryWordUsageByNormKey, type StoryWordUsageRow } from '../lib/storyWordUsageIndex'
import { normalizeWordRegistryKey } from '../lib/tokens'

export type FrequencyPair = { rank: number; word: string }

async function fetchStoryWordUsageIndex(): Promise<Record<string, StoryWordUsageRow[]>> {
  const { data: titles, error: titlesErr } = await supabase.from('titles').select('id, name')
  if (titlesErr) throw titlesErr
  const nameMap = new Map<number, string>(
    (titles ?? []).map((t) => [Number((t as { id: number }).id), String((t as { name: string }).name ?? '')])
  )

  const pageSize = 1000
  let from = 0
  const sentences: { title_id: number | null; tokens_array: unknown }[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('story_sentences')
      .select('title_id, tokens_array')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const chunk = (data ?? []) as { title_id: number | null; tokens_array: unknown }[]
    sentences.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return buildStoryWordUsageByNormKey(sentences, nameMap)
}

export default function FrequencyNumbersPage() {
  const [selected, setSelected] = useState<FrequencyPair | null>(null)
  const { data: rows = [], isLoading, error, isError } = useQuery({
    queryKey: ['word_registry', 'frequency_list'],
    queryFn: fetchFrequencyPairsFromRegistry,
    staleTime: 30_000,
  })
  const {
    data: usageByKey,
    isLoading: usageLoading,
    error: usageError,
    isError: usageIsError,
  } = useQuery({
    queryKey: ['story_sentences', 'word_usage_by_title'],
    queryFn: fetchStoryWordUsageIndex,
    staleTime: 5 * 60_000,
  })

  const totalUsesByNormKey = useMemo(() => {
    if (!usageByKey) return null as Map<string, number> | null
    const m = new Map<string, number>()
    for (const [k, list] of Object.entries(usageByKey)) {
      m.set(k, list.reduce((s, r) => s + r.count, 0))
    }
    return m
  }, [usageByKey])

  const selectedStoryUsage = useMemo((): StoryWordUsageRow[] | null => {
    if (!selected || !usageByKey) return null
    return usageByKey[normalizeWordRegistryKey(selected.word)] ?? []
  }, [selected, usageByKey])

  const selectedUsageTotal = useMemo(() => {
    if (!selectedStoryUsage?.length) return 0
    return selectedStoryUsage.reduce((s, x) => s + x.count, 0)
  }, [selectedStoryUsage])

  const countLabel = useMemo(() => `${rows.length} entr${rows.length !== 1 ? 'ies' : 'y'}`, [rows.length])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Frequency list</h1>
      <p className="text-sm text-gray-600 mb-4">
        Rows come from <span className="font-mono">word_registry</span> where <span className="font-mono">frequency_rank</span>{' '}
        is set, ordered by rank. Words without a rank are not listed here. To bulk-load ranks from a spreadsheet you can
        still use <span className="font-mono text-xs">npm run export:freq:json</span> plus{' '}
        <span className="font-mono text-xs">scripts/import-frequency-ranks.mjs</span> or the Words page. Story usage
        counts come from <span className="font-mono">story_sentences.tokens_array</span> (per title).
      </p>
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {(error as Error).message}
        </p>
      )}
      {usageIsError && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          Story usage: {formatError(usageError)}
        </p>
      )}
      {!isLoading && !isError && (
        <p className="text-xs text-gray-500 mb-3">{countLabel}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="border rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium w-24">Rank</th>
                <th className="text-left p-2 font-medium">Word</th>
                <th className="text-right p-2 font-medium w-20 tabular-nums">Uses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const norm = normalizeWordRegistryKey(r.word)
                const uses =
                  totalUsesByNormKey == null
                    ? null
                    : (totalUsesByNormKey.get(norm) ?? 0)
                const rowTint = 'bg-green-50 hover:bg-green-100/90'
                const selectedRing =
                  selected?.rank === r.rank && selected?.word === r.word ? ' ring-2 ring-inset ring-blue-500' : ''
                return (
                  <tr
                    key={`${r.rank}-${r.word}`}
                    className={`border-t cursor-pointer${selectedRing} ${rowTint}`}
                    onClick={() => setSelected(r)}
                  >
                    <td className="p-2 font-mono text-gray-700 tabular-nums">{r.rank}</td>
                    <td className="p-2">{r.word}</td>
                    <td className="p-2 text-right font-mono tabular-nums text-gray-700">
                      {uses === null ? '…' : uses}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && !isLoading && !isError && (
            <p className="p-4 text-sm text-gray-500">
              No ranked words yet. Set <span className="font-mono">frequency_rank</span> on{' '}
              <span className="font-mono">word_registry</span> rows (Words page, or import script).
            </p>
          )}
        </div>
        <div className="border rounded-lg p-4 min-h-[12rem] max-h-[70vh] overflow-y-auto">
          {!selected ? (
            <p className="text-sm text-gray-500">Select a row to see details.</p>
          ) : (
            <div className="text-sm space-y-4">
              <dl className="space-y-2">
                <div>
                  <dt className="text-xs font-semibold text-gray-500 uppercase">Rank</dt>
                  <dd className="font-mono text-lg tabular-nums">{selected.rank}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-gray-500 uppercase">Word</dt>
                  <dd className="text-lg">{selected.word}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-gray-500 uppercase">word_registry</dt>
                  <dd className="text-green-800 font-medium">Listed from registry (has frequency_rank)</dd>
                </div>
              </dl>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Stories (token count in story_sentences)
                  {usageLoading && <span className="font-normal text-gray-400"> · loading…</span>}
                </h3>
                {usageByKey && !usageLoading && selectedStoryUsage !== null && (
                  <>
                    {selectedStoryUsage.length === 0 ? (
                      <p className="text-sm text-gray-600">
                        No tokens matching this normalized form in <span className="font-mono">story_sentences</span>{' '}
                        (or those rows have no <span className="font-mono">title_id</span>).
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-600 mb-2">
                          Total: <span className="font-mono tabular-nums">{selectedUsageTotal}</span> token
                          {selectedUsageTotal !== 1 ? 's' : ''} across {selectedStoryUsage.length}{' '}
                          {selectedStoryUsage.length === 1 ? 'story' : 'stories'}
                        </p>
                        <ul className="space-y-1.5 border rounded-md divide-y max-h-48 overflow-y-auto">
                          {selectedStoryUsage.map((u) => (
                            <li
                              key={u.titleId}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                            >
                              <Link
                                to={`/stories/${u.titleId}`}
                                className="text-blue-700 hover:underline truncate min-w-0"
                              >
                                {u.titleName}
                              </Link>
                              <span className="shrink-0 font-mono tabular-nums text-gray-700">{u.count}×</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
