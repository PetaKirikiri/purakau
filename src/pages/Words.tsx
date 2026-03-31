import { useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDbConfirmation } from '../context/DbConfirmationContext'
import { normalizeWordRegistryKey, resolveToken, stripPunctuationFromWord } from '../lib/tokens'
import { getPosTypeBackgroundColor } from '../lib/tokenStyling'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'
import { cleanupWordRegistryInApp } from '../lib/cleanupWordRegistry'
import { syncWordRegistryFromStories } from '../lib/syncWordRegistry'
import { WordsTestModal } from '../components/WordsTestModal'
import {
  lookupTeAka,
  teAkaLookupQueryKey,
  teAkaResultHasAudio,
  type TeAkaResult,
} from '../lib/lookupTeAka'
import {
  compareByFrequencyRankThenWordText,
  fetchAllRegistryWordsWithPos,
  WORD_REGISTRY_FULL_LIST_QUERY_KEY,
  type WordRegistryPosRow,
} from '../lib/fetchAllWordRegistry'
import { WordsVocabularyWordCard } from '../components/words/WordsVocabularyWordCard'
import { addWordToPosType } from '../lib/saveTokenPos'
import { slugifySubCategory } from '../lib/subCategorySlug'

type PosEntry = { pos_type_id: number; code: string; auto?: boolean }
type PosType = { id: number; code: string; label: string; color?: string | null }

/** Registry row or a kīwaha phrase only in `kiwaha` (legacy / pending sync). */
type WordRow = {
  word_text: string
  pos_types: unknown
  _fromKiwahaLibrary?: boolean
  _kiwahaRowId?: number
}

/** Synthetic tab: list rows in word_registry with no pos_types entries yet. */
const NO_POS_TAB_ID = '_no_pos'

function wordHasAnyPos(posTypesUnknown: unknown): boolean {
  const posList = (posTypesUnknown ?? []) as PosEntry[]
  return posList.some((p) => p?.pos_type_id != null)
}

function sanitizePosCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

const COLOR_PALETTE: { name: string; shades: [string, string, string, string, string] }[] = [
  { name: 'Red', shades: ['#8b0000', '#b22222', '#e53935', '#ef5350', '#e57373'] },
  { name: 'Orange', shades: ['#e65100', '#ff6d00', '#ff9800', '#ffb74d', '#ffe0b2'] },
  { name: 'Yellow', shades: ['#f9a825', '#fbc02d', '#ffeb3b', '#fff176', '#fff9c4'] },
  { name: 'Green', shades: ['#2e7d32', '#43a047', '#66bb6a', '#81c784', '#a5d6a7'] },
  { name: 'Blue', shades: ['#1565c0', '#1e88e5', '#42a5f5', '#64b5f6', '#90caf9'] },
  { name: 'Indigo', shades: ['#283593', '#3949ab', '#5c6bc0', '#7986cb', '#9fa8da'] },
  { name: 'Violet', shades: ['#6a1b9a', '#7b1fa2', '#8e24aa', '#ab47bc', '#ce93d8'] },
]

export default function Words() {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [colorPanelFor, setColorPanelFor] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [newWordForType, setNewWordForType] = useState('')
  const [newPosCode, setNewPosCode] = useState('')
  const [newPosLabel, setNewPosLabel] = useState('')
  const [newPosDesc, setNewPosDesc] = useState('')
  const [newPosColor, setNewPosColor] = useState('#0d9488')
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()

  const { data: words, isLoading: wordsLoading, error: wordsError } = useQuery({
    queryKey: WORD_REGISTRY_FULL_LIST_QUERY_KEY,
    queryFn: () => fetchAllRegistryWordsWithPos(),
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const { data: posTypes = [] } = useQuery({
    queryKey: ['pos_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_types')
        .select('id, code, label, color')
        .order('label')
      if (error) throw error
      return data as PosType[]
    },
    staleTime: 15 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const { data: allSubCategories = [] } = useQuery({
    queryKey: ['sub_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sub_categories').select('id, slug, label').order('slug')
      if (error) throw error
      return (data ?? []) as { id: number; slug: string; label: string | null }[]
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const { data: wordSubcatLinks = [] } = useQuery({
    queryKey: ['word_registry_sub_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('word_registry_sub_categories')
        .select('word_text, sub_category_id')
      if (error) throw error
      return (data ?? []) as { word_text: string; sub_category_id: number }[]
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const posTypesForTabs = useMemo(() => {
    const k = posTypes.find((p) => p.code === 'KIWHA')
    const rest = posTypes
      .filter((p) => p.code !== 'KIWHA')
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return k ? [k, ...rest] : rest
  }, [posTypes])

  const interrogPos = useMemo(() => posTypes.find((p) => p.code === 'INTERROG'), [posTypes])

  const createPosTypeMutation = useMutation({
    mutationFn: async (payload: { code: string; label: string; description: string; color: string }) => {
      const code = sanitizePosCode(payload.code)
      if (!code || !payload.label.trim()) throw new Error('Code and label are required.')
      const { error } = await supabase.from('pos_types').insert({
        code,
        label: payload.label.trim(),
        description: payload.description.trim() || null,
        color: payload.color?.trim() || '#64748b',
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setNewPosCode('')
      setNewPosLabel('')
      setNewPosDesc('')
      setNewPosColor('#0d9488')
      await queryClient.invalidateQueries({ queryKey: ['pos_types'] })
      showDbConfirmation({
        tables: ['pos_types'],
        details: ['pos_types: created new word type'],
      })
    },
  })

  const createInterrogPosPresetMutation = useMutation({
    mutationFn: async () => {
      const { data: ex } = await supabase.from('pos_types').select('id').eq('code', 'INTERROG').maybeSingle()
      if (ex) return { created: false as const }
      const { error } = await supabase.from('pos_types').insert({
        code: 'INTERROG',
        label: 'Interrogative',
        description: 'Question word (e.g. wai, hea, aha, he aha)',
        color: '#0d9488',
      })
      if (error) throw error
      return { created: true as const }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['pos_types'] })
      if (result?.created) {
        showDbConfirmation({
          tables: ['pos_types'],
          details: ['pos_types: added Interrogative (INTERROG)'],
        })
      }
    },
  })

  const hasKiwahaPos = posTypes.some((p) => p.code === 'KIWHA')
  const { data: kiwahaLibraryRows = [] } = useQuery({
    queryKey: ['kiwaha_phrases_library'],
    queryFn: async () => {
      const { data, error } = await supabase.from('kiwaha').select('id, phrase_text').order('phrase_text')
      if (error) throw error
      return (data ?? []) as { id: number; phrase_text: string }[]
    },
    enabled: hasKiwahaPos,
    staleTime: 60_000,
  })

  const updateColorMutation = useMutation({
    mutationFn: async ({
      id,
      color,
      label,
    }: {
      id: number
      color: string
      label: string
    }) => {
      const { data, error } = await supabase
        .from('pos_types')
        .update({ color })
        .eq('id', id)
        .select('id, color')
        .single()
      if (error) throw error
      return { data, label }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pos_types'] })
      if (result?.data) {
        showDbConfirmation({
          tables: ['pos_types'],
          details: [`pos_types: updated color for ${result.label} → ${result.data.color}`],
        })
      }
    },
  })

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) => {
      const { data, error } = await supabase
        .from('pos_types')
        .update({ label: label.trim() })
        .eq('id', id)
        .select('id, label')
        .single()
      if (error) throw error
      return { data }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pos_types'] })
      if (result?.data) {
        showDbConfirmation({
          tables: ['pos_types'],
          details: [`pos_types: renamed to ${result.data.label}`],
        })
      }
    },
  })

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_word_registry')
      if (error) {
        const isFnNotFound = /function.*not found|schema cache/i.test(error.message ?? '')
        if (isFnNotFound) {
          return cleanupWordRegistryInApp()
        }
        throw error
      }
      return data?.[0] as { deleted_count: number; merged_count: number } | undefined
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      if (result) {
        showDbConfirmation({
          tables: ['word_registry'],
          details: [
            `word_registry: cleaned up — ${result.deleted_count} entries processed, ${result.merged_count} unique words kept`,
          ],
        })
      }
    },
    onError: () => {},
  })

  const addWordForTabMutation = useMutation({
    mutationFn: async ({ wordText, posTypeId }: { wordText: string; posTypeId: number }) => {
      const r = await addWordToPosType(wordText, posTypeId)
      if (!r.ok) throw new Error(r.error)
    },
    onSuccess: async () => {
      setNewWordForType('')
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      showDbConfirmation({
        tables: ['word_registry'],
        details: ['word_registry: added word for this type'],
      })
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncWordRegistryFromStories,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      await queryClient.invalidateQueries({ queryKey: ['kiwaha_phrases_library'] })
      showDbConfirmation({
        tables: ['word_registry'],
        details: [`word_registry: synced ${result.synced} tagged tokens from stories`],
      })
    },
  })

  const removeCategoryMutation = useMutation({
    mutationFn: async ({
      wordText,
      posTypeId,
    }: {
      wordText: string
      posTypeId: number
    }) => {
      const { data: row, error: fetchError } = await supabase
        .from('word_registry')
        .select('pos_types')
        .eq('word_text', wordText)
        .single()
      if (fetchError || !row) throw fetchError ?? new Error('Word not found')
      const posList = (row.pos_types ?? []) as PosEntry[]
      const updated = posList.filter((p) => p.pos_type_id !== posTypeId)
      const { error: updateError } = await supabase
        .from('word_registry')
        .update({ pos_types: updated })
        .eq('word_text', wordText)
      if (updateError) throw updateError
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
    },
  })

  const toggleAutoMutation = useMutation({
    mutationFn: async ({
      wordText,
      posTypeId,
      auto,
    }: {
      wordText: string
      posTypeId: number
      auto: boolean
    }) => {
      const { data: row, error: fetchError } = await supabase
        .from('word_registry')
        .select('pos_types')
        .eq('word_text', wordText)
        .single()
      if (fetchError || !row) throw fetchError ?? new Error('Word not found')
      const posList = (row.pos_types ?? []) as PosEntry[]
      const updated = posList.map((p) =>
        p.pos_type_id === posTypeId ? { ...p, auto } : p
      )
      const { error: updateError } = await supabase
        .from('word_registry')
        .update({ pos_types: updated })
        .eq('word_text', wordText)
      if (updateError) throw updateError
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
    },
  })

  const deleteWordMutation = useMutation({
    mutationFn: async (wordText: string) => {
      const attempts = [...new Set([normalizeWordRegistryKey(wordText), wordText.trim()])].filter(
        Boolean
      )
      let deleted = 0
      for (const key of attempts) {
        const { data, error } = await supabase
          .from('word_registry')
          .delete()
          .eq('word_text', key)
          .select('word_text')
        if (error) throw error
        deleted += data?.length ?? 0
        if (deleted > 0) return
      }
      throw new Error(`No word_registry row matched for “${wordText}”.`)
    },
    onSuccess: async (_, wordText) => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      queryClient.removeQueries({ queryKey: teAkaLookupQueryKey(wordText) })
      showDbConfirmation({
        tables: ['word_registry'],
        details: [`word_registry: deleted "${wordText}"`],
      })
    },
    onError: (err) => {
      window.alert(formatError(err))
    },
  })

  const wordToSubcatIds = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const row of wordSubcatLinks) {
      if (!m.has(row.word_text)) m.set(row.word_text, new Set())
      m.get(row.word_text)!.add(row.sub_category_id)
    }
    return m
  }, [wordSubcatLinks])

  const unlinkSubCategoryMutation = useMutation({
    mutationFn: async ({ wordText, subCategoryId }: { wordText: string; subCategoryId: number }) => {
      const { error } = await supabase
        .from('word_registry_sub_categories')
        .delete()
        .eq('word_text', wordText)
        .eq('sub_category_id', subCategoryId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['word_registry_sub_categories'] })
    },
    onError: (err) => window.alert(formatError(err)),
  })

  const createSubCategoryMutation = useMutation({
    mutationFn: async ({ wordText, displayName }: { wordText: string; displayName: string }) => {
      const label = displayName.trim()
      if (!label) throw new Error('Name required')
      const baseSlug = slugifySubCategory(label)
      let slug = baseSlug
      let subId: number | undefined
      for (let a = 0; a < 8; a++) {
        const { data: existing } = await supabase.from('sub_categories').select('id').eq('slug', slug).maybeSingle()
        if (existing?.id != null) {
          subId = existing.id
          break
        }
        const { data: ins, error: insErr } = await supabase
          .from('sub_categories')
          .insert({ slug, label })
          .select('id')
          .single()
        if (!insErr && ins) {
          subId = ins.id
          break
        }
        slug = `${baseSlug}-${a + 2}`
      }
      if (subId == null) throw new Error('Could not create sub-category')
      const { error: linkErr } = await supabase.from('word_registry_sub_categories').insert({
        word_text: wordText,
        sub_category_id: subId,
      })
      if (linkErr && !/duplicate key|unique constraint/i.test(linkErr.message ?? '')) throw linkErr
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sub_categories'] })
      await queryClient.invalidateQueries({ queryKey: ['word_registry_sub_categories'] })
      showDbConfirmation({
        tables: ['sub_categories', 'word_registry_sub_categories'],
        details: ['Linked word to sub-category (created new tag if needed).'],
      })
    },
    onError: (err) => window.alert(formatError(err)),
  })

  const subCategoryMutationPending =
    unlinkSubCategoryMutation.isPending || createSubCategoryMutation.isPending

  const noPosCount = useMemo(
    () => (words ?? []).filter((w) => !wordHasAnyPos(w.pos_types)).length,
    [words]
  )

  const tabs = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: NO_POS_TAB_ID, label: 'No POS' },
      ...posTypesForTabs.map((p) => ({ id: String(p.id), label: p.label })),
    ],
    [posTypesForTabs]
  )
  const selectedTab = activeTab ?? tabs[0]?.id ?? 'all'

  const selectedPosFromTab = useMemo(
    () =>
      selectedTab === 'all' || selectedTab === NO_POS_TAB_ID
        ? null
        : (posTypes.find((p) => String(p.id) === selectedTab) ?? null),
    [selectedTab, posTypes]
  )

  const filteredWords = useMemo(() => {
    const list = (words ?? []) as WordRow[]
    let filtered: WordRow[]
    if (selectedTab === 'all') filtered = list
    else if (selectedTab === NO_POS_TAB_ID) {
      filtered = list.filter((w) => !wordHasAnyPos(w.pos_types))
    } else {
      filtered = list.filter((w) => {
        const posList = (w.pos_types ?? []) as PosEntry[]
        return posList.some((p) => String(p.pos_type_id) === selectedTab)
      })
    }
    return [...filtered].sort((a, b) =>
      compareByFrequencyRankThenWordText(
        a.word_text,
        (a as WordRegistryPosRow).frequency_rank,
        b.word_text,
        (b as WordRegistryPosRow).frequency_rank
      )
    )
  }, [words, selectedTab])

  const kiwahaPos = useMemo(() => posTypes.find((p) => p.code === 'KIWHA'), [posTypes])

  const wordsForTab = useMemo(() => {
    if (!kiwahaPos || selectedTab !== String(kiwahaPos.id)) return filteredWords
    const norm = (s: string) => stripPunctuationFromWord(s)
    const registryNorms = new Set((words ?? []).map((w) => norm(w.word_text)))
    const extras: WordRow[] = kiwahaLibraryRows
      .filter((k) => !registryNorms.has(norm(k.phrase_text)))
      .map((k) => ({
        word_text: k.phrase_text,
        pos_types: [{ pos_type_id: kiwahaPos.id, code: 'KIWHA' }],
        _fromKiwahaLibrary: true,
        _kiwahaRowId: k.id,
      }))
      .sort((a, b) => a.word_text.localeCompare(b.word_text, undefined, { sensitivity: 'base' }))
    return [...filteredWords, ...extras]
  }, [filteredWords, selectedTab, kiwahaPos, words, kiwahaLibraryRows])

  const teAkaAudioQueries = useQueries({
    queries: wordsForTab.map((w) => ({
      queryKey: teAkaLookupQueryKey(w.word_text),
      queryFn: () => lookupTeAka(w.word_text),
      select: (r: TeAkaResult | null) => teAkaResultHasAudio(r),
      staleTime: 86_400_000,
      gcTime: 7 * 86_400_000,
      enabled: !wordsLoading && wordsForTab.length > 0,
    })),
  })

  if (wordsLoading) return <div className="p-6">Loading...</div>
  if (wordsError) return <div className="p-6 text-red-600">Error: {formatError(wordsError)}</div>

  const selectedPosType =
    colorPanelFor !== null ? posTypes.find((p) => String(p.id) === colorPanelFor) : null

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Words</h1>

      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-sm text-gray-500">
          Create <strong>word types</strong> (POS rows) below — they are stored in{' '}
          <span className="font-mono">pos_types</span> and appear as tabs. Then pick a tab to add words to{' '}
          <span className="font-mono">word_registry</span>. Use the <strong>No POS</strong> tab to see registry rows that
          do not have a type yet
          {noPosCount > 0 ? ` (${noPosCount})` : ''}. Kīwaha and Interrogative stay pinned after &quot;All&quot; when
          those types exist.
        </p>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            disabled={!wordsForTab.length}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test words
          </button>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync from stories'}
          </button>
          <button
            type="button"
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending || !words?.length}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cleanupMutation.isPending ? 'Cleaning…' : 'Clean up duplicates'}
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-3 p-3 border rounded bg-gray-50">
        <h2 className="text-sm font-medium text-gray-800">New word type (POS)</h2>
        <p className="text-xs text-gray-600">
          Inserts a row into <span className="font-mono">pos_types</span>. Use a short uppercase code (e.g.{' '}
          <span className="font-mono">INTERROG</span>).
        </p>
        {!interrogPos && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
              disabled={createInterrogPosPresetMutation.isPending}
              onClick={() => createInterrogPosPresetMutation.mutate()}
            >
              {createInterrogPosPresetMutation.isPending ? 'Adding…' : 'Add preset: Interrogative (INTERROG)'}
            </button>
            {createInterrogPosPresetMutation.isError && (
              <span className="text-xs text-red-600">{formatError(createInterrogPosPresetMutation.error)}</span>
            )}
          </div>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            createPosTypeMutation.mutate({
              code: newPosCode,
              label: newPosLabel,
              description: newPosDesc,
              color: newPosColor,
            })
          }}
        >
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600">Code</label>
            <input
              value={newPosCode}
              onChange={(e) => setNewPosCode(e.target.value)}
              placeholder="INTERROG"
              className="px-2 py-1 text-sm border rounded w-28 font-mono"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[8rem]">
            <label className="text-xs text-gray-600">Label</label>
            <input
              value={newPosLabel}
              onChange={(e) => setNewPosLabel(e.target.value)}
              placeholder="Interrogative"
              className="px-2 py-1 text-sm border rounded w-full"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[10rem]">
            <label className="text-xs text-gray-600">Description (optional)</label>
            <input
              value={newPosDesc}
              onChange={(e) => setNewPosDesc(e.target.value)}
              placeholder="Question words"
              className="px-2 py-1 text-sm border rounded w-full"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-600">Colour</label>
            <input
              type="color"
              value={newPosColor}
              onChange={(e) => setNewPosColor(e.target.value)}
              className="h-8 w-12 border rounded cursor-pointer bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={createPosTypeMutation.isPending || !sanitizePosCode(newPosCode) || !newPosLabel.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {createPosTypeMutation.isPending ? 'Creating…' : 'Create word type'}
          </button>
        </form>
        {createPosTypeMutation.isError && (
          <p className="text-sm text-red-600">{formatError(createPosTypeMutation.error)}</p>
        )}
      </div>

      {posTypes.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-1 border-b">
            {tabs.map((t) => {
              const posType =
                t.id !== 'all' && t.id !== NO_POS_TAB_ID
                  ? posTypesForTabs.find((p) => String(p.id) === t.id)
                  : null
              const color = getPosTypeBackgroundColor(posType?.color)
              return (
                <div key={t.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id)
                      setColorPanelFor(null)
                    }}
                    className={`px-3 py-2 text-sm font-medium rounded-t ${
                      selectedTab === t.id
                        ? 'bg-gray-100 border border-b-0 border-gray-200 -mb-px'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {t.label}
                  </button>
                  {posType && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setColorPanelFor(colorPanelFor === t.id ? null : t.id)
                      }}
                      className={`h-5 w-5 rounded border -mb-px ${
                        colorPanelFor === t.id ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Set color for ${t.label}`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {colorPanelFor && selectedPosType && (
            <div className="mb-4 p-3 border rounded bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-gray-600 shrink-0">Label:</label>
                <input
                  key={`${selectedPosType.id}-${selectedPosType.label}`}
                  type="text"
                  defaultValue={selectedPosType.label}
                  className="flex-1 px-2 py-1 text-sm border rounded"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== selectedPosType.label) {
                      updateLabelMutation.mutate({ id: selectedPosType.id, label: v })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = (e.target as HTMLInputElement).value.trim()
                      if (v && v !== selectedPosType.label) {
                        updateLabelMutation.mutate({ id: selectedPosType.id, label: v })
                      }
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-600 mb-2">Set color</p>
              {updateColorMutation.isError && (
                <p className="text-red-600 text-sm mb-2">
                  {formatError(updateColorMutation.error)}
                </p>
              )}
              {updateLabelMutation.isError && (
                <p className="text-red-600 text-sm mb-2">
                  {formatError(updateLabelMutation.error)}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {COLOR_PALETTE.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-gray-600">{c.name}</span>
                    <div className="flex gap-1">
                      {c.shades.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            updateColorMutation.mutate({
                              id: selectedPosType.id,
                              color: hex,
                              label: selectedPosType.label,
                            })
                          }
                          className={`h-6 w-6 rounded border-2 transition ${
                            selectedPosType.color === hex
                              ? 'border-gray-900 scale-110'
                              : 'border-gray-300 hover:border-gray-500'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedPosFromTab && (
        <form
          className="mb-4 flex flex-wrap items-end gap-2 p-3 border rounded bg-gray-50"
          onSubmit={(e) => {
            e.preventDefault()
            const raw = newWordForType.trim()
            if (!raw) return
            addWordForTabMutation.mutate({ wordText: raw, posTypeId: selectedPosFromTab.id })
          }}
        >
          <div className="flex flex-col gap-0.5">
            <label htmlFor="add-word-for-pos" className="text-xs text-gray-600">
              Add word as «{selectedPosFromTab.label}»
            </label>
            <input
              id="add-word-for-pos"
              type="text"
              value={newWordForType}
              onChange={(e) => setNewWordForType(e.target.value)}
              placeholder="Surface form (e.g. wai, he aha)"
              className="px-2 py-1 text-sm border rounded min-w-[12rem]"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={addWordForTabMutation.isPending || !newWordForType.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {addWordForTabMutation.isPending ? 'Adding…' : 'Add word'}
          </button>
          {addWordForTabMutation.isError && (
            <p className="text-sm text-red-600 w-full">{formatError(addWordForTabMutation.error)}</p>
          )}
        </form>
      )}

      {words?.length === 0 && selectedTab === 'all' ? (
        <p className="text-gray-500">No words yet. Tag tokens in a story or save a kīwaha phrase.</p>
      ) : (
        <>
          {!wordsForTab.length ? (
            <p className="text-gray-500">
              {selectedTab === NO_POS_TAB_ID
                ? 'Every word in the registry has at least one POS type.'
                : 'No entries for this type yet.'}
            </p>
          ) : (
          <ul className="space-y-2">
            {wordsForTab.map((w, i) => {
              const posList = (w.pos_types ?? []) as PosEntry[]
              const tokenForTab = {
                index: 0,
                text: '',
                pos_type_id:
                  selectedTab === 'all' || selectedTab === NO_POS_TAB_ID
                    ? null
                    : Number(selectedTab),
                word_pos_entry_id: null,
              }
              const resolved = resolveToken(tokenForTab, posTypes)
              const aq = teAkaAudioQueries[i]
              const audioPending = aq?.isPending
              const audioYes = aq?.data === true
              const subIds = wordToSubcatIds.get(w.word_text)
              const subAssigned = allSubCategories.filter((s) => subIds?.has(s.id))
              return (
                <WordsVocabularyWordCard
                  key={w._kiwahaRowId != null ? `kw-${w._kiwahaRowId}` : w.word_text}
                  wordText={w.word_text}
                  fromKiwahaLibrary={w._fromKiwahaLibrary}
                  underlineColor={resolved.underlineColor}
                  audioPending={audioPending}
                  audioYes={audioYes}
                  posList={posList}
                  posTypes={posTypes}
                  onToggleAuto={(posTypeId, nextAuto) =>
                    toggleAutoMutation.mutate({ wordText: w.word_text, posTypeId, auto: nextAuto })
                  }
                  onRemoveCategory={(posTypeId) =>
                    removeCategoryMutation.mutate({ wordText: w.word_text, posTypeId })
                  }
                  subCategoriesAssigned={subAssigned}
                  onUnassignSubCategory={
                    w._fromKiwahaLibrary
                      ? undefined
                      : (id) => unlinkSubCategoryMutation.mutate({ wordText: w.word_text, subCategoryId: id })
                  }
                  onCreateSubCategory={
                    w._fromKiwahaLibrary
                      ? undefined
                      : (name) =>
                          createSubCategoryMutation.mutate({ wordText: w.word_text, displayName: name })
                  }
                  subCategoryBusy={subCategoryMutationPending}
                  deleteDisabled={deleteWordMutation.isPending}
                  onDeleteWord={() => {
                    if (
                      !window.confirm(
                        `Remove “${w.word_text}” from your word list?\n\nStory tags are unchanged. “Sync from stories” can add this word again if it still appears in stories.`
                      )
                    )
                      return
                    deleteWordMutation.mutate(w.word_text)
                  }}
                />
              )
            })}
          </ul>
          )}
        </>
      )}

      <WordsTestModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        words={wordsForTab}
        posTypes={posTypes}
      />
    </div>
  )
}
