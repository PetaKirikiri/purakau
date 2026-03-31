import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CoursesOnCourseWordCard,
  CoursesRegistryWordCard,
} from '../components/courses/CoursesVocabularyWordCards'
import { CourseLessonsPanel } from '../components/courses/CourseLessonsPanel'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'
import { getCourseDefinition } from '../lib/getCourseDefinition'
import { getPosTypeBackgroundColor } from '../lib/tokenStyling'
import {
  compareByFrequencyRankThenWordText,
  fetchAllRegistryWordsWithPos,
  WORD_REGISTRY_FULL_LIST_QUERY_KEY,
  type WordRegistryPosRow,
} from '../lib/fetchAllWordRegistry'
import {
  lookupTeAka,
  teAkaLookupQueryKey,
  teAkaResultHasAudio,
  type TeAkaResult,
} from '../lib/lookupTeAka'
import { useDbConfirmation } from '../context/DbConfirmationContext'
import { addWordToPosType } from '../lib/saveTokenPos'
import { slugifySubCategory } from '../lib/subCategorySlug'
import {
  normalizeWordRegistryKey,
  resolveToken,
  stripPunctuationFromWord,
  vocabularySearchExactMatch,
  vocabularySearchMatches,
} from '../lib/tokens'
import '../styles/coursesVocabularyCards.css'

type CourseRow = {
  id: number
  name: string
  description: string | null
  title_id: number | null
  created_at: string
}

type PosEntry = { pos_type_id: number; code: string; auto?: boolean }
type PosType = { id: number; code: string; label: string; color?: string | null }
type WordRow = { word_text: string; pos_types: unknown }

type CourseWordRow = {
  id: number
  course_id: number
  word_text: string
  pos_type_id: number
}

type VocabPickRow = { word_text: string; pos_type_id: number }

/** Courses vocab can list huge registry slices; uncapped Te Aka = tens of thousands of useQueries (tab freeze). */
const MAX_TE_AKA_LOOKUPS_ON_COURSES = 120

function vocabPickKey(row: VocabPickRow): string {
  return `${row.word_text}\t${row.pos_type_id}`
}

/** Exact query match first (per section), then `compareRank` for the rest. */
function orderExactSearchFirst<T>(
  rows: T[],
  searchRaw: string,
  getWordText: (row: T) => string,
  compareRank: (a: T, b: T) => number
): T[] {
  if (!searchRaw.trim()) return rows
  const exact: T[] = []
  const rest: T[] = []
  for (const row of rows) {
    if (vocabularySearchExactMatch(getWordText(row), searchRaw)) exact.push(row)
    else rest.push(row)
  }
  exact.sort(compareRank)
  rest.sort(compareRank)
  return [...exact, ...rest]
}

/** bigserial / PostgREST can surface row ids as string; keep comparisons stable vs React state number. */
function cwRowIdEq(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

/** Minimal export: POS label (or code) → list of `word_text`, sorted by POS name then word. */
function buildCourseVocabularyExportJson(rows: CourseWordRow[], posTypes: PosType[]): string {
  const labelById = new Map(posTypes.map((p) => [p.id, p.label]))
  const codeById = new Map(posTypes.map((p) => [p.id, p.code]))
  const sorted = [...rows].sort(
    (a, b) =>
      a.pos_type_id - b.pos_type_id ||
      a.word_text.localeCompare(b.word_text, undefined, { sensitivity: 'base' })
  )
  const byPos = new Map<string, string[]>()
  for (const r of sorted) {
    const posKey =
      labelById.get(r.pos_type_id) ?? codeById.get(r.pos_type_id) ?? `id:${r.pos_type_id}`
    if (!byPos.has(posKey)) byPos.set(posKey, [])
    byPos.get(posKey)!.push(r.word_text)
  }
  const out: Record<string, string[]> = {}
  for (const [k, w] of [...byPos.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
  )) {
    out[k] = w
  }
  return JSON.stringify(out, null, 2)
}

const AGENT_DEBUG_INGEST =
  'http://127.0.0.1:7489/ingest/b001ac32-8358-43d0-a2cd-b6f88c884101'
const AGENT_SESSION_ID = '3a0348'

/** Debug transport: HTTP fetch only (no reliance on log files). Also appends to `window.__AGENT_DEBUG__` in DevTools. */
function agentDebugFetch(payload: {
  hypothesisId?: string
  location: string
  message: string
  data?: Record<string, unknown>
}) {
  const bodyObj = { sessionId: AGENT_SESSION_ID, ...payload, timestamp: Date.now() }
  void fetch(AGENT_DEBUG_INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': AGENT_SESSION_ID,
    },
    body: JSON.stringify(bodyObj),
    keepalive: true,
  }).catch(() => {})
  if (typeof window !== 'undefined') {
    const w = window as Window & { __AGENT_DEBUG__?: unknown[] }
    w.__AGENT_DEBUG__ = w.__AGENT_DEBUG__ ?? []
    w.__AGENT_DEBUG__.push(bodyObj)
    if (w.__AGENT_DEBUG__.length > 120) w.__AGENT_DEBUG__.splice(0, w.__AGENT_DEBUG__.length - 120)
  }
}

export default function Courses() {
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [titleId, setTitleId] = useState<string>('')
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null)
  const [panelMode, setPanelMode] = useState<'course' | 'new'>('course')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTitleId, setEditTitleId] = useState<string>('')
  const [newCustomWord, setNewCustomWord] = useState('')
  const [definitionOpen, setDefinitionOpen] = useState(false)
  const [definitionPosTabId, setDefinitionPosTabId] = useState<string | null>(null)
  const [vocabPosTab, setVocabPosTab] = useState<string>('all')
  const [courseWorkspaceTab, setCourseWorkspaceTab] = useState<'vocabulary' | 'lessons'>('vocabulary')

  const { data: titles } = useQuery({
    queryKey: ['titles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('titles').select('id, name').order('name')
      if (error) throw error
      return data as { id: number; name: string }[]
    },
  })

  const { data: courses, isLoading, error } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      let { data, error } = await supabase
        .from('courses')
        .select('id, name, description, title_id, created_at')
        .order('name')
      const errMsg = formatError(error)
      if (errMsg.includes('title_id') && errMsg.includes('does not exist')) {
        const fallback = await supabase.from('courses').select('id, name, description, created_at').order('name')
        if (fallback.error) throw fallback.error
        return (fallback.data ?? []).map((r) => ({ ...r, title_id: null as number | null }))
      }
      if (error) throw error
      return data as {
        id: number
        name: string
        description: string | null
        title_id: number | null
        created_at: string
      }[]
    },
  })

  useEffect(() => {
    if (!courses?.length) {
      setActiveCourseId(null)
      setPanelMode('new')
      return
    }
    if (panelMode === 'new') return
    if (activeCourseId != null && courses.some((c) => c.id === activeCourseId)) return
    setActiveCourseId(courses[0].id)
  }, [courses, activeCourseId, panelMode])

  const activeCourse = useMemo(
    () => (activeCourseId != null ? courses?.find((c) => c.id === activeCourseId) ?? null : null),
    [courses, activeCourseId]
  )

  useEffect(() => {
    setDefinitionPosTabId(null)
  }, [definitionOpen, activeCourseId])

  const { data: definition, isLoading: definitionLoading } = useQuery({
    queryKey: ['course-definition', activeCourseId],
    queryFn: () => getCourseDefinition(activeCourseId!),
    enabled: definitionOpen && activeCourseId != null,
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
  })

  const { data: allSubCategories = [] } = useQuery({
    queryKey: ['sub_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sub_categories').select('id, slug, label').order('slug')
      if (error) throw error
      return (data ?? []) as { id: number; slug: string; label: string | null }[]
    },
    staleTime: 60_000,
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
  })

  const posTypesForTabs = useMemo(() => {
    const k = posTypes.find((p) => p.code === 'KIWHA')
    const rest = posTypes
      .filter((p) => p.code !== 'KIWHA')
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return k ? [k, ...rest] : rest
  }, [posTypes])

  const vocabTabs = useMemo(
    () => [{ id: 'all', label: 'All' }, ...posTypesForTabs.map((p) => ({ id: String(p.id), label: p.label }))],
    [posTypesForTabs]
  )

  const activeVocabPosLabel = useMemo(() => {
    if (vocabPosTab === 'all') return ''
    return posTypes.find((p) => String(p.id) === vocabPosTab)?.label ?? 'this POS'
  }, [vocabPosTab, posTypes])

  const { data: words = [], isLoading: wordsLoading } = useQuery({
    queryKey: WORD_REGISTRY_FULL_LIST_QUERY_KEY,
    queryFn: () => fetchAllRegistryWordsWithPos(),
    staleTime: 5 * 60_000,
  })

  const { data: courseWordRows = [], isLoading: courseWordsLoading } = useQuery({
    queryKey: ['course_words', activeCourseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_words')
        .select('id, course_id, word_text, pos_type_id')
        .eq('course_id', activeCourseId!)
        .order('word_text')
      if (error) throw error
      return data as CourseWordRow[]
    },
    enabled: activeCourseId != null && panelMode === 'course',
  })

  const courseWordKeySet = useMemo(() => {
    const s = new Set<string>()
    for (const r of courseWordRows) s.add(`${r.word_text}\t${r.pos_type_id}`)
    return s
  }, [courseWordRows])

  const courseVocabCounts = useMemo(() => {
    const entryCount = courseWordRows.length
    const uniqueWords = new Set(courseWordRows.map((r) => r.word_text)).size
    return { entryCount, uniqueWords }
  }, [courseWordRows])

  const frequencyRankByWordText = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const w of words as WordRegistryPosRow[]) {
      const key = normalizeWordRegistryKey(w.word_text)
      const raw = w.frequency_rank as unknown
      const n =
        raw === null || raw === undefined || raw === '' ? null : Number(raw)
      m.set(key, n != null && Number.isFinite(n) ? Math.trunc(n) : null)
    }
    return m
  }, [words])

  const vocabRankLabel = (wordText: string) => {
    const n = frequencyRankByWordText.get(normalizeWordRegistryKey(wordText))
    return n != null ? String(n) : '?'
  }

  useEffect(() => {
    const list = words as WordRegistryPosRow[]
    if (!list.length) return
    const withNumericRank = list.filter((w) => {
      const r = w.frequency_rank as unknown
      return r != null && r !== '' && Number.isFinite(Number(r))
    }).length
    // #region agent log
    agentDebugFetch({
      hypothesisId: 'RANK',
      location: 'Courses.tsx:wordRegistryRankAudit',
      message: 'frequency_rank_field_after_fetch',
      data: {
        rowCount: list.length,
        withNumericRank,
        firstRowKeys: Object.keys(list[0] as object),
        firstFrequencyRank: list[0]?.frequency_rank,
        mapSize: frequencyRankByWordText.size,
      },
    })
    // #endregion
  }, [words, frequencyRankByWordText])

  const pickRows: VocabPickRow[] = useMemo(() => {
    const list = (words ?? []) as WordRow[]
    const rankOf = (wt: string) =>
      frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null
    if (vocabPosTab === 'all') {
      const out: VocabPickRow[] = []
      for (const w of list) {
        const posList = (w.pos_types ?? []) as PosEntry[]
        for (const p of posList) {
          if (p?.pos_type_id != null) out.push({ word_text: w.word_text, pos_type_id: p.pos_type_id })
        }
      }
      return out.sort((a, b) => {
        const byRank = compareByFrequencyRankThenWordText(
          a.word_text,
          rankOf(a.word_text),
          b.word_text,
          rankOf(b.word_text)
        )
        if (byRank !== 0) return byRank
        return a.pos_type_id - b.pos_type_id
      })
    }
    const pid = Number(vocabPosTab)
    const baseRows = list
      .filter((w) => {
        const posList = (w.pos_types ?? []) as PosEntry[]
        return posList.some((p) => String(p.pos_type_id) === vocabPosTab)
      })
      .map((w) => ({ word_text: w.word_text, pos_type_id: pid }))
    return baseRows.sort((a, b) =>
      compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
    )
  }, [words, vocabPosTab, frequencyRankByWordText])

  const courseWordsDisplayed = useMemo(() => {
    const rankOf = (wt: string) =>
      frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null
    const rows =
      vocabPosTab === 'all'
        ? courseWordRows
        : courseWordRows.filter((r) => r.pos_type_id === Number(vocabPosTab))
    return [...rows].sort((a, b) => {
      const byRank = compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
      if (byRank !== 0) return byRank
      return (
        a.word_text.localeCompare(b.word_text, undefined, { sensitivity: 'base' }) ||
        a.pos_type_id - b.pos_type_id
      )
    })
  }, [courseWordRows, vocabPosTab, frequencyRankByWordText])

  const registryRowsNotOnCourse = useMemo(() => {
    return pickRows.filter((row) => !courseWordKeySet.has(vocabPickKey(row)))
  }, [pickRows, courseWordKeySet])

  /** Live filter from “New word” field (POS tab only) — same line as list below. */
  const courseVocabSearchActive = vocabPosTab !== 'all' && newCustomWord.trim().length > 0

  const courseWordsDisplayedFiltered = useMemo(() => {
    if (vocabPosTab === 'all' || !newCustomWord.trim()) return courseWordsDisplayed
    const rankOf = (wt: string) =>
      frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null
    const compareRank = (a: CourseWordRow, b: CourseWordRow) => {
      const byRank = compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
      if (byRank !== 0) return byRank
      return (
        a.word_text.localeCompare(b.word_text, undefined, { sensitivity: 'base' }) ||
        a.pos_type_id - b.pos_type_id
      )
    }
    const filtered = courseWordsDisplayed.filter((r) =>
      vocabularySearchMatches(r.word_text, newCustomWord)
    )
    return orderExactSearchFirst(filtered, newCustomWord, (r) => r.word_text, compareRank)
  }, [courseWordsDisplayed, vocabPosTab, newCustomWord, frequencyRankByWordText])

  const registryRowsNotOnCourseFiltered = useMemo(() => {
    if (vocabPosTab === 'all' || !newCustomWord.trim()) return registryRowsNotOnCourse
    const rankOf = (wt: string) =>
      frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null
    const compareRank = (a: VocabPickRow, b: VocabPickRow) => {
      const byRank = compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
      if (byRank !== 0) return byRank
      return a.pos_type_id - b.pos_type_id || a.word_text.localeCompare(b.word_text)
    }
    const filtered = registryRowsNotOnCourse.filter((row) =>
      vocabularySearchMatches(row.word_text, newCustomWord)
    )
    return orderExactSearchFirst(filtered, newCustomWord, (r) => r.word_text, compareRank)
  }, [registryRowsNotOnCourse, vocabPosTab, newCustomWord, frequencyRankByWordText])

  /** In word_registry and matches search, but not tagged with the active POS tab yet — add can tag + enroll. */
  const registryWordsMissingCurrentPosFiltered = useMemo(() => {
    if (vocabPosTab === 'all' || !newCustomWord.trim()) return []
    const list = (words ?? []) as WordRow[]
    const rankOf = (wt: string) =>
      frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null
    const filtered = list.filter((w) => {
      const posList = (w.pos_types ?? []) as PosEntry[]
      if (posList.some((p) => String(p.pos_type_id) === vocabPosTab)) return false
      if (!vocabularySearchMatches(w.word_text, newCustomWord)) return false
      const pid = Number(vocabPosTab)
      if (!Number.isFinite(pid)) return false
      if (courseWordKeySet.has(vocabPickKey({ word_text: w.word_text, pos_type_id: pid })))
        return false
      return true
    })
    const compareRank = (a: WordRow, b: WordRow) =>
      compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
    return orderExactSearchFirst(filtered, newCustomWord, (w) => w.word_text, compareRank)
  }, [words, vocabPosTab, newCustomWord, courseWordKeySet, frequencyRankByWordText])

  const teAkaRegistryBudget = Math.max(
    0,
    MAX_TE_AKA_LOOKUPS_ON_COURSES - courseWordsDisplayedFiltered.length
  )
  const teAkaHasPosSlots = Math.min(registryRowsNotOnCourseFiltered.length, teAkaRegistryBudget)
  const teAkaMissingPosSlots = Math.min(
    registryWordsMissingCurrentPosFiltered.length,
    Math.max(0, teAkaRegistryBudget - teAkaHasPosSlots)
  )

  const teAkaCappedVocabItems = useMemo(
    () =>
      [
        ...courseWordsDisplayedFiltered.map((r) => ({ kind: 'course' as const, r })),
        ...registryRowsNotOnCourseFiltered
          .slice(0, teAkaHasPosSlots)
          .map((row) => ({ kind: 'registry' as const, row })),
        ...registryWordsMissingCurrentPosFiltered
          .slice(0, teAkaMissingPosSlots)
          .map((w) => ({
            kind: 'registry_missing_pos' as const,
            wordText: w.word_text,
            posTypeId: Number(vocabPosTab),
          })),
      ] as const,
    [
      courseWordsDisplayedFiltered,
      registryRowsNotOnCourseFiltered,
      registryWordsMissingCurrentPosFiltered,
      teAkaHasPosSlots,
      teAkaMissingPosSlots,
      vocabPosTab,
    ]
  )

  const teAkaCourseWordQueries = useQueries({
    queries: teAkaCappedVocabItems.map((item) => {
      const word =
        item.kind === 'course'
          ? item.r.word_text
          : item.kind === 'registry'
            ? item.row.word_text
            : item.wordText
      return {
        queryKey: teAkaLookupQueryKey(word),
        queryFn: () => lookupTeAka(word),
        select: (res: TeAkaResult | null) => teAkaResultHasAudio(res),
        staleTime: 86_400_000,
        gcTime: 7 * 86_400_000,
        enabled:
          !wordsLoading &&
          !courseWordsLoading &&
          teAkaCappedVocabItems.length > 0 &&
          panelMode === 'course',
      }
    }),
  })

  const insertMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; title_id: number | null }) => {
      let { data, error } = await supabase
        .from('courses')
        .insert({
          name: payload.name.trim(),
          description: payload.description.trim() || null,
          title_id: payload.title_id || null,
        })
        .select()
        .single()
      const errMsg = formatError(error)
      if (errMsg.includes('title_id') && errMsg.includes('does not exist')) {
        const fb = await supabase
          .from('courses')
          .insert({ name: payload.name.trim(), description: payload.description.trim() || null })
          .select()
          .single()
        if (fb.error) throw fb.error
        return fb.data as { id: number }
      }
      if (error) throw error
      return data as { id: number }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      setName('')
      setDescription('')
      setTitleId('')
      if (data?.id != null) {
        setActiveCourseId(data.id)
        setPanelMode('course')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      title_id,
    }: {
      id: number
      name: string
      description: string
      title_id: number | null
    }) => {
      let { data, error } = await supabase
        .from('courses')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          title_id: title_id || null,
        })
        .eq('id', id)
        .select()
        .single()
      const errMsg = formatError(error)
      if (errMsg.includes('title_id') && errMsg.includes('does not exist')) {
        const fb = await supabase
          .from('courses')
          .update({ name: name.trim(), description: description.trim() || null })
          .eq('id', id)
          .select()
          .single()
        if (fb.error) throw fb.error
        return fb.data
      }
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('courses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.removeQueries({ queryKey: ['course_words', deletedId] })
      setEditingId(null)
      setActiveCourseId((prev) => (prev === deletedId ? null : prev))
    },
  })

  const addCourseWordsMutation = useMutation({
    mutationFn: async (args: { courseId: number; keys: string[] }) => {
      const rows = args.keys
        .map((k) => {
          const tab = k.indexOf('\t')
          if (tab < 0) return null
          const word_text = k.slice(0, tab)
          const pos_type_id = Number(k.slice(tab + 1))
          if (!word_text || !Number.isFinite(pos_type_id)) return null
          return { course_id: args.courseId, word_text, pos_type_id }
        })
        .filter((r): r is { course_id: number; word_text: string; pos_type_id: number } => r != null)
      // #region agent log
      if (!rows.length) {
        agentDebugFetch({
          hypothesisId: 'SAVE',
          location: 'Courses.tsx:addCourseWordsMutation',
          message: 'course_words_insert_skip_no_rows',
          data: { courseId: args.courseId, keyCount: args.keys.length },
        })
        return
      }
      agentDebugFetch({
        hypothesisId: 'SAVE',
        location: 'Courses.tsx:addCourseWordsMutation',
        message: 'course_words_insert_attempt',
        data: {
          courseId: args.courseId,
          rowCount: rows.length,
          pairs: rows.map((r) => `${r.word_text}\t${r.pos_type_id}`),
        },
      })
      // #endregion
      const { data, error } = await supabase.from('course_words').insert(rows).select('id')
      // #region agent log
      if (error) {
        agentDebugFetch({
          hypothesisId: 'SAVE',
          location: 'Courses.tsx:addCourseWordsMutation',
          message: 'course_words_insert_error',
          data: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          },
        })
        throw error
      }
      agentDebugFetch({
        hypothesisId: 'SAVE',
        location: 'Courses.tsx:addCourseWordsMutation',
        message: 'course_words_insert_ok',
        data: { returnedIds: (data ?? []).map((r) => r.id) },
      })
      // #endregion
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['course_words', activeCourseId] })
      if (activeCourseId != null) {
        void queryClient.invalidateQueries({ queryKey: ['course_lesson_words', activeCourseId] })
      }
    },
  })

  const addCustomWordToCourseMutation = useMutation({
    mutationFn: async (args: { courseId: number; rawWord: string; posTypeId: number }) => {
      const add = await addWordToPosType(args.rawWord, args.posTypeId)
      if (!add.ok) throw new Error(add.error)
      const word_text = stripPunctuationFromWord(args.rawWord)
      const { error } = await supabase.from('course_words').insert({
        course_id: args.courseId,
        word_text,
        pos_type_id: args.posTypeId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      void queryClient.invalidateQueries({ queryKey: ['course_words', activeCourseId] })
      if (activeCourseId != null) {
        void queryClient.invalidateQueries({ queryKey: ['course_lesson_words', activeCourseId] })
      }
      setNewCustomWord('')
    },
  })

  const removeCourseWordMutation = useMutation({
    mutationFn: async (args: {
      courseId: number
      wordText: string
      posTypeId: number
    }): Promise<void> => {
      const { data, error } = await supabase
        .from('course_words')
        .delete()
        .eq('course_id', args.courseId)
        .eq('word_text', args.wordText)
        .eq('pos_type_id', args.posTypeId)
        .select('id')
      // #region agent log
      agentDebugFetch({
        hypothesisId: 'REMUTE',
        location: 'Courses.tsx:removeCourseWordMutation',
        message: 'course_words_delete_by_composite',
        data: {
          courseId: args.courseId,
          wordText: args.wordText,
          posTypeId: args.posTypeId,
          deletedCount: data?.length ?? 0,
          err: error?.message ?? null,
        },
      })
      // #endregion
      if (error) throw error
      if (!data?.length) {
        throw new Error(
          'No course word row was deleted (it may already be removed or the filter did not match).'
        )
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['course_words', activeCourseId] })
      if (activeCourseId != null) {
        void queryClient.invalidateQueries({ queryKey: ['course_lesson_words', activeCourseId] })
      }
    },
    onError: (err) => {
      agentDebugFetch({
        hypothesisId: 'REMUTE',
        location: 'Courses.tsx:removeCourseWordMutation',
        message: 'course_words_delete_error',
        data: { message: formatError(err) },
      })
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

  const startEdit = (c: CourseRow) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditDescription(c.description ?? '')
    setEditTitleId(c.title_id ? String(c.title_id) : '')
  }

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    const tid = titleId ? Number(titleId) : null
    if (trimmed) insertMutation.mutate({ name: trimmed, description, title_id: tid })
  }

  const addRegistryRowToCourse = (row: VocabPickRow) => {
    if (activeCourseId == null) return
    addCourseWordsMutation.mutate({ courseId: activeCourseId, keys: [vocabPickKey(row)] })
  }

  const selectCourseTab = (id: number) => {
    setActiveCourseId(id)
    setPanelMode('course')
    setEditingId(null)
    setDefinitionOpen(false)
    setCourseWorkspaceTab('vocabulary')
  }

  const clickNewTab = () => {
    setPanelMode('new')
    setEditingId(null)
    setDefinitionOpen(false)
    setCourseWorkspaceTab('vocabulary')
  }

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  const newCourseForm = (
    <form onSubmit={handleSubmitNew} className="p-4 border rounded bg-gray-50 space-y-3">
      <h2 className="text-sm font-medium text-gray-700">New course</h2>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Story (optional)</label>
        <select
          value={titleId}
          onChange={(e) => setTitleId(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">None</option>
          {titles?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Level 1"
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Beginner Te Reo"
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={insertMutation.isPending || !name.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {insertMutation.isPending ? 'Adding...' : 'Add'}
      </button>
      {insertMutation.isError && <p className="text-red-600 text-sm">{formatError(insertMutation.error)}</p>}
    </form>
  )

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Courses</h1>
      <p className="text-sm text-gray-500 mb-6">
        Linking a story is optional: when set, it drives the course definition panel. Add words from{' '}
        <span className="font-mono">word_registry</span> by POS type below.
      </p>

      {courses && courses.length > 0 && (
        <div className="flex flex-wrap items-end gap-1 border-b border-gray-200 mb-4">
          {courses.map((c) => {
            const isActive = panelMode === 'course' && activeCourseId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCourseTab(c.id)}
                className={`px-3 py-2 text-sm font-medium rounded-t border border-b-0 ${
                  isActive
                    ? 'bg-white border-gray-200 text-gray-900 -mb-px pb-2.5 z-[1]'
                    : 'bg-gray-50 border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {c.name}
              </button>
            )
          })}
          <button
            type="button"
            onClick={clickNewTab}
            aria-label="New course"
            className={`px-3 py-2 text-sm font-medium rounded-t border border-b-0 ${
              panelMode === 'new'
                ? 'bg-white border-gray-200 text-gray-900 -mb-px pb-2.5 z-[1]'
                : 'bg-gray-50 border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            +
          </button>
        </div>
      )}

      {panelMode === 'new' || !courses?.length ? (
        newCourseForm
      ) : activeCourse ? (
        (() => {
          const c = activeCourse
          const titleObj = c.title_id ? titles?.find((t) => t.id === c.title_id) : null
          const isEditing = editingId === c.id
          return (
            <div className="border rounded-lg border-gray-200 p-4 space-y-6">
              {isEditing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    updateMutation.mutate({
                      id: c.id,
                      name: editName,
                      description: editDescription,
                      title_id: editTitleId ? Number(editTitleId) : null,
                    })
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Story (optional)</label>
                    <select
                      value={editTitleId}
                      onChange={(e) => setEditTitleId(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">None</option>
                      {titles?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={updateMutation.isPending || !editName.trim()}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                  {updateMutation.isError && (
                    <p className="text-red-600 text-sm">{formatError(updateMutation.error)}</p>
                  )}
                </form>
              ) : (
                <>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="font-medium text-lg">{c.name}</div>
                      {c.description && <div className="text-sm text-gray-500 mt-1">{c.description}</div>}
                      {titleObj ? (
                        <div className="text-sm mt-1">
                          <Link to={`/stories/${titleObj.id}`} className="text-blue-600 hover:underline">
                            {titleObj.name}
                          </Link>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 mt-1">No story linked</div>
                      )}
                      {courseWordsLoading ? (
                        <div className="text-sm text-gray-500 mt-1">Loading word count…</div>
                      ) : courseVocabCounts.entryCount === 0 ? (
                        <div className="text-sm text-gray-600 mt-1">No vocabulary on this course yet.</div>
                      ) : courseVocabCounts.uniqueWords === courseVocabCounts.entryCount ? (
                        <div className="text-sm text-gray-600 mt-1">
                          {courseVocabCounts.entryCount} word
                          {courseVocabCounts.entryCount === 1 ? '' : 's'} on this course
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 mt-1">
                          {courseVocabCounts.uniqueWords} word{courseVocabCounts.uniqueWords === 1 ? '' : 's'} on this
                          course ({courseVocabCounts.entryCount} word–POS{' '}
                          {courseVocabCounts.entryCount === 1 ? 'entry' : 'entries'})
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => setDefinitionOpen((o) => !o)}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                      >
                        {definitionOpen ? 'Hide definition' : 'Definition'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c as CourseRow)}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete ${c.name}?`)) deleteMutation.mutate(c.id)
                        }}
                        disabled={deleteMutation.isPending}
                        className="px-2 py-1 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {definitionOpen && (
                    <div className="pt-4 border-t text-sm space-y-4">
                      {definitionLoading ? (
                        <p className="text-gray-500">Loading definition...</p>
                      ) : definition ? (
                        <>
                          <div>
                            <h4 className="font-medium text-gray-800 mb-1">Words by POS</h4>
                            <p className="text-xs text-gray-500 mb-2">
                              {definition.uniqueTokens.length} word–POS pairs · {definition.posTypes.length} POS types
                              in the story
                            </p>
                            {definition.posTypes.length > 0 ? (
                              <>
                                <div className="flex flex-wrap items-center gap-1 border-b">
                                  {definition.posTypes.map((p) => {
                                    const tabId = String(p.id)
                                    const selectedTab =
                                      definitionPosTabId ?? String(definition.posTypes[0]?.id ?? '')
                                    const isSelected = tabId === selectedTab
                                    const color = getPosTypeBackgroundColor(p.color)
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setDefinitionPosTabId(tabId)}
                                        className={`px-3 py-2 text-sm font-medium rounded-t inline-flex items-center gap-1.5 ${
                                          isSelected
                                            ? 'bg-gray-100 border border-b-0 border-gray-200 -mb-px'
                                            : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                      >
                                        <span
                                          className="h-2 w-2 rounded-full shrink-0 border border-gray-300/80"
                                          style={{ backgroundColor: color }}
                                          aria-hidden
                                        />
                                        {p.label}
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className="mt-3">
                                  {(() => {
                                    const selectedTab =
                                      definitionPosTabId ?? String(definition.posTypes[0]?.id ?? '')
                                    const wordsForTab = definition.uniqueTokens.filter(
                                      (t) => String(t.posTypeId) === selectedTab
                                    )
                                    return wordsForTab.length > 0 ? (
                                      <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                                        {wordsForTab.map((t) => (
                                          <li key={`${t.word}-${t.posTypeId}`} className="text-gray-700">
                                            <span className="font-medium">{t.word}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-gray-500 text-xs">No words for this type in the story yet.</p>
                                    )
                                  })()}
                                </div>
                              </>
                            ) : (
                              <p className="text-gray-500">None yet — tag words in the story.</p>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-800 mb-1">Phrases</h4>
                            <p className="text-xs text-gray-500 mb-1">
                              {definition.phrases.length} phrase patterns that match
                            </p>
                            {definition.phrases.length > 0 ? (
                              <ul className="space-y-1 text-xs">
                                {definition.phrases.map((p) => (
                                  <li key={p.id} className="text-gray-700">
                                    <span className="font-medium">{p.name}</span>
                                    <span className="text-gray-500"> — {p.posLabels.join('–')}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-gray-500">None match yet.</p>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-800 mb-1">Sentence structures</h4>
                            <p className="text-xs text-gray-500 mb-1">
                              {definition.sentenceStructures.length} saved from this story
                            </p>
                            {definition.sentenceStructures.length > 0 ? (
                              <ul className="space-y-1 text-xs">
                                {definition.sentenceStructures.map((s) => (
                                  <li key={s.id} className="text-gray-700">
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-gray-500"> — {s.posLabels.join(' ')}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-gray-500">None yet — save patterns from the story editor.</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-gray-500">No story linked or no content yet.</p>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-3">
                    <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
                      <button
                        type="button"
                        onClick={() => setCourseWorkspaceTab('vocabulary')}
                        className={`px-3 py-1.5 text-sm font-medium rounded border ${
                          courseWorkspaceTab === 'vocabulary'
                            ? 'border-gray-300 bg-white text-gray-900'
                            : 'border-transparent text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Vocabulary
                      </button>
                      <button
                        type="button"
                        onClick={() => setCourseWorkspaceTab('lessons')}
                        className={`px-3 py-1.5 text-sm font-medium rounded border ${
                          courseWorkspaceTab === 'lessons'
                            ? 'border-gray-300 bg-white text-gray-900'
                            : 'border-transparent text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Lessons
                      </button>
                    </div>
                    {courseWorkspaceTab === 'lessons' && activeCourseId != null ? (
                      <CourseLessonsPanel
                        courseId={activeCourseId}
                        courseWordRows={courseWordRows}
                        posTypes={posTypes}
                        courseWordsLoading={courseWordsLoading}
                        frequencyRankByWordText={frequencyRankByWordText}
                        wordsLoading={wordsLoading}
                      />
                    ) : null}
                    {courseWorkspaceTab === 'vocabulary' ? (
                      <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-gray-800 m-0">Course vocabulary</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={activeCourseId == null || courseWordsLoading}
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => {
                            if (activeCourseId == null) return
                            const json = buildCourseVocabularyExportJson(courseWordRows, posTypes)
                            void navigator.clipboard.writeText(json).then(
                              () => window.alert('Vocabulary JSON copied to clipboard.'),
                              () =>
                                window.alert(
                                  'Could not copy to clipboard. Use Download JSON or copy from a downloaded file.'
                                )
                            )
                          }}
                        >
                          Copy JSON
                        </button>
                        <button
                          type="button"
                          disabled={activeCourseId == null || courseWordsLoading}
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => {
                            if (activeCourseId == null) return
                            const json = buildCourseVocabularyExportJson(courseWordRows, posTypes)
                            const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            const safe =
                              c.name
                                .trim()
                                .replace(/[^a-z0-9-_]+/gi, '-')
                                .replace(/^-|-$/g, '')
                                .slice(0, 60) || 'course'
                            a.download = `${safe}-${activeCourseId}-vocabulary.json`
                            document.body.appendChild(a)
                            a.click()
                            a.remove()
                            URL.revokeObjectURL(url)
                          }}
                        >
                          Download JSON
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Words on this course are listed first — the main row removes the word from this course. Use the
                      Lessons tab to schedule words across 10 weeks. With a POS tab selected, filter registry rows below
                      and click to add; press Enter if the word is not listed.
                    </p>
                    {addCourseWordsMutation.isError && (
                      <p className="text-xs text-red-800 rounded border border-red-200 bg-red-50 p-2" role="alert">
                        {(() => {
                          const err = addCourseWordsMutation.error
                          const msg = formatError(err)
                          const code =
                            err != null && typeof err === 'object' && 'code' in err
                              ? String((err as { code?: string }).code)
                              : ''
                          const isDup =
                            code === '23505' ||
                            msg.toLowerCase().includes('duplicate') ||
                            msg.toLowerCase().includes('unique constraint')
                          return isDup
                            ? 'That word is already on this course for that part of speech. It is saved in the database; refresh or pick another word to see a change.'
                            : msg
                        })()}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1 border-b">
                      {vocabTabs.map((tab) => {
                        const isAll = tab.id === 'all'
                        const pos = !isAll ? posTypes.find((p) => String(p.id) === tab.id) : null
                        const color = pos ? getPosTypeBackgroundColor(pos.color) : null
                        const selected = vocabPosTab === tab.id
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setVocabPosTab(tab.id)}
                            className={`px-3 py-2 text-xs font-medium rounded-t inline-flex items-center gap-1.5 ${
                              selected
                                ? 'bg-gray-100 border border-b-0 border-gray-200 -mb-px'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            {!isAll && color && (
                              <span
                                className="h-2 w-2 rounded-full shrink-0 border border-gray-300/80"
                                style={{ backgroundColor: color }}
                                aria-hidden
                              />
                            )}
                            {tab.label}
                          </button>
                        )
                      })}
                    </div>

                    {vocabPosTab !== 'all' && (
                      <form
                        className="mb-4 flex flex-wrap items-end gap-2 p-3 border rounded bg-gray-50"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const raw = newCustomWord.trim()
                          const posTypeId = Number(vocabPosTab)
                          if (!raw || activeCourseId == null || !Number.isFinite(posTypeId)) return
                          addCustomWordToCourseMutation.mutate({
                            courseId: activeCourseId,
                            rawWord: raw,
                            posTypeId,
                          })
                        }}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <label htmlFor="course-new-word" className="text-xs text-gray-600">
                            Search / new word (
                            {posTypes.find((p) => String(p.id) === vocabPosTab)?.label ?? 'POS'})
                          </label>
                          <input
                            id="course-new-word"
                            type="text"
                            value={newCustomWord}
                            onChange={(e) => setNewCustomWord(e.target.value)}
                            placeholder="Type to filter the list — click a row to add, or Enter to create & add"
                            className="px-2 py-1 text-sm border rounded w-full min-w-0"
                            autoComplete="off"
                            aria-describedby="course-new-word-hint"
                          />
                          <p id="course-new-word-hint" className="text-[11px] text-gray-500">
                            Matches any part of the word (case-insensitive). Rows can include words already in
                            word_registry without this POS yet. Enter runs{' '}
                            <span className="font-medium">Add word</span> when nothing fits.
                          </p>
                        </div>
                        <button
                          type="submit"
                          disabled={
                            addCustomWordToCourseMutation.isPending ||
                            !newCustomWord.trim() ||
                            activeCourseId == null
                          }
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50 shrink-0"
                        >
                          {addCustomWordToCourseMutation.isPending ? 'Adding…' : 'Add word'}
                        </button>
                        {addCustomWordToCourseMutation.isError && (
                          <p className="text-xs text-red-600 w-full">
                            {formatError(addCustomWordToCourseMutation.error)}
                          </p>
                        )}
                      </form>
                    )}

                    {wordsLoading || courseWordsLoading ? (
                      <p className="text-sm text-gray-500">Loading…</p>
                    ) : courseWordsDisplayed.length === 0 && registryRowsNotOnCourse.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        {pickRows.length === 0
                          ? vocabPosTab === 'all'
                            ? 'No words for this filter.'
                            : `No words are tagged as ${activeVocabPosLabel} in word_registry yet. Use the search field: words already in your registry will appear so you can add them (this tags them as ${activeVocabPosLabel} and enrolls them on the course).`
                          : 'All words in this filter are already on this course.'}
                      </p>
                    ) : courseVocabSearchActive &&
                      courseWordsDisplayedFiltered.length === 0 &&
                      registryRowsNotOnCourseFiltered.length === 0 &&
                      registryWordsMissingCurrentPosFiltered.length === 0 ? (
                      <p className="text-sm text-gray-700 rounded border border-amber-200 bg-amber-50/90 p-3">
                        No words in the list match that search. Press{' '}
                        <span className="font-semibold">Enter</span> (or <span className="font-semibold">Add word</span>
                        ) to add <span className="font-mono">{newCustomWord.trim()}</span> to this course for
                        this POS.
                      </p>
                    ) : (
                      <ul className="m-0 p-0 list-none space-y-2">
                        {courseWordsDisplayedFiltered.map((r, i) => {
                          const tokenForTab = {
                            index: 0,
                            text: '',
                            pos_type_id: r.pos_type_id,
                            word_pos_entry_id: null,
                          }
                          const resolved = resolveToken(tokenForTab, posTypes)
                          const aq = teAkaCourseWordQueries[i]
                          const audioPending = aq?.isPending
                          const audioYes = aq?.data === true
                          const rowCourseName =
                            courses?.find((c) => Number(c.id) === Number(r.course_id))?.name ??
                            `Course #${r.course_id}`
                          const coursePills = (
                            <button
                              type="button"
                              data-course-tag-pill
                              onClick={(e) => {
                                e.stopPropagation()
                                selectCourseTab(r.course_id)
                              }}
                              className="max-w-full truncate"
                              title={rowCourseName}
                            >
                              {rowCourseName}
                            </button>
                          )
                          const subIdsOn = wordToSubcatIds.get(r.word_text)
                          const subAssignedOn = allSubCategories.filter((s) => subIdsOn?.has(s.id))
                          return (
                            <CoursesOnCourseWordCard
                              key={r.id}
                              rowId={r.id}
                              wordText={r.word_text}
                              posLabel={
                                posTypes.find((p) => Number(p.id) === Number(r.pos_type_id))?.label ??
                                null
                              }
                              frequencyRankLabel={vocabRankLabel(r.word_text)}
                              underlineColor={resolved.underlineColor}
                              audioPending={audioPending}
                              audioYes={audioYes}
                              coursePills={coursePills}
                              subCategoriesAssigned={subAssignedOn}
                              onUnassignSubCategory={(subCategoryId) =>
                                unlinkSubCategoryMutation.mutate({
                                  wordText: r.word_text,
                                  subCategoryId,
                                })
                              }
                              onCreateSubCategory={(displayName) =>
                                createSubCategoryMutation.mutate({
                                  wordText: r.word_text,
                                  displayName,
                                })
                              }
                              subCategoryBusy={subCategoryMutationPending}
                              onRemove={() => {
                                // #region agent log
                                agentDebugFetch({
                                  hypothesisId: 'H2',
                                  location: 'Courses.tsx:courseWordRemove',
                                  message: 'remove_click_stop_propagation',
                                  data: { rowId: r.id },
                                })
                                // #endregion
                                removeCourseWordMutation.mutate({
                                  courseId: r.course_id,
                                  wordText: r.word_text,
                                  posTypeId: r.pos_type_id,
                                })
                              }}
                              removeDisabled={
                                removeCourseWordMutation.isPending &&
                                removeCourseWordMutation.variables != null &&
                                removeCourseWordMutation.variables.courseId === r.course_id &&
                                removeCourseWordMutation.variables.wordText === r.word_text &&
                                removeCourseWordMutation.variables.posTypeId === r.pos_type_id
                              }
                            />
                          )
                        })}
                        {registryRowsNotOnCourseFiltered.map((row, j) => {
                          const tokenForTab = {
                            index: 0,
                            text: '',
                            pos_type_id: row.pos_type_id,
                            word_pos_entry_id: null,
                          }
                          const resolved = resolveToken(tokenForTab, posTypes)
                          const aq =
                            j < teAkaHasPosSlots
                              ? teAkaCourseWordQueries[courseWordsDisplayedFiltered.length + j]
                              : undefined
                          const audioPending = aq?.isPending
                          const audioYes = aq?.data === true
                          const addDisabled =
                            addCourseWordsMutation.isPending || activeCourseId == null
                          const subIdsReg = wordToSubcatIds.get(row.word_text)
                          const subAssignedReg = allSubCategories.filter((s) => subIdsReg?.has(s.id))
                          return (
                            <CoursesRegistryWordCard
                              key={`add-${vocabPickKey(row)}`}
                              wordText={row.word_text}
                              posLabel={
                                posTypes.find((p) => Number(p.id) === Number(row.pos_type_id))
                                  ?.label ?? null
                              }
                              frequencyRankLabel={vocabRankLabel(row.word_text)}
                              targetCourseName={
                                activeCourse?.name?.trim()
                                  ? activeCourse.name
                                  : 'Select a course tab first'
                              }
                              underlineColor={resolved.underlineColor}
                              audioPending={audioPending}
                              audioYes={audioYes}
                              addDisabled={addDisabled}
                              subCategoriesAssigned={subAssignedReg}
                              onUnassignSubCategory={(subCategoryId) =>
                                unlinkSubCategoryMutation.mutate({
                                  wordText: row.word_text,
                                  subCategoryId,
                                })
                              }
                              onCreateSubCategory={(displayName) =>
                                createSubCategoryMutation.mutate({
                                  wordText: row.word_text,
                                  displayName,
                                })
                              }
                              subCategoryBusy={subCategoryMutationPending}
                              onAdd={() => {
                                if (addDisabled) return
                                // #region agent log
                                agentDebugFetch({
                                  hypothesisId: 'H3',
                                  location: 'Courses.tsx:registryCard',
                                  message: 'registry_full_card_add',
                                  data: { pickKey: vocabPickKey(row) },
                                })
                                // #endregion
                                addRegistryRowToCourse(row)
                              }}
                            />
                          )
                        })}
                        {registryWordsMissingCurrentPosFiltered.map((w, k) => {
                          const pid = Number(vocabPosTab)
                          const tokenForTab = {
                            index: 0,
                            text: '',
                            pos_type_id: pid,
                            word_pos_entry_id: null,
                          }
                          const resolved = resolveToken(tokenForTab, posTypes)
                          const aq =
                            k < teAkaMissingPosSlots
                              ? teAkaCourseWordQueries[
                                  courseWordsDisplayedFiltered.length + teAkaHasPosSlots + k
                                ]
                              : undefined
                          const audioPending = aq?.isPending
                          const audioYes = aq?.data === true
                          const tagAddDisabled =
                            addCustomWordToCourseMutation.isPending || activeCourseId == null
                          const subIdsMiss = wordToSubcatIds.get(w.word_text)
                          const subAssignedMiss = allSubCategories.filter((s) => subIdsMiss?.has(s.id))
                          return (
                            <CoursesRegistryWordCard
                              key={`add-missing-pos-${w.word_text}-${pid}`}
                              wordText={w.word_text}
                              posLabel={activeVocabPosLabel.trim() ? activeVocabPosLabel : null}
                              frequencyRankLabel={vocabRankLabel(w.word_text)}
                              targetCourseName={
                                activeCourse?.name?.trim()
                                  ? activeCourse.name
                                  : 'Select a course tab first'
                              }
                              underlineColor={resolved.underlineColor}
                              audioPending={audioPending}
                              audioYes={audioYes}
                              addDisabled={tagAddDisabled}
                              registryAddHint={`In word_registry but not tagged as ${activeVocabPosLabel} yet — adding tags it and enrolls on this course.`}
                              ariaLabel={`Add ${w.word_text} as ${activeVocabPosLabel} and enroll on ${activeCourse?.name ?? 'course'}`}
                              subCategoriesAssigned={subAssignedMiss}
                              onUnassignSubCategory={(subCategoryId) =>
                                unlinkSubCategoryMutation.mutate({
                                  wordText: w.word_text,
                                  subCategoryId,
                                })
                              }
                              onCreateSubCategory={(displayName) =>
                                createSubCategoryMutation.mutate({
                                  wordText: w.word_text,
                                  displayName,
                                })
                              }
                              subCategoryBusy={subCategoryMutationPending}
                              onAdd={() => {
                                if (tagAddDisabled || activeCourseId == null) return
                                addCustomWordToCourseMutation.mutate({
                                  courseId: activeCourseId,
                                  rawWord: w.word_text,
                                  posTypeId: pid,
                                })
                              }}
                            />
                          )
                        })}
                      </ul>
                    )}
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )
        })()
      ) : null}

      {!courses?.length && <p className="text-gray-500 mt-4">No courses yet. Create one above.</p>}
    </div>
  )
}
