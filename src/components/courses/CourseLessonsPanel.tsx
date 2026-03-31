import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatError } from '../../lib/formatError'
import { useDbConfirmation } from '../../context/DbConfirmationContext'
import { normalizeWordRegistryKey, resolveToken } from '../../lib/tokens'
import { getPosTypeBackgroundColor } from '../../lib/tokenStyling'
import {
  compareByFrequencyRankThenWordText,
} from '../../lib/fetchAllWordRegistry'
import {
  lookupTeAka,
  teAkaLookupQueryKey,
  teAkaResultHasAudio,
  type TeAkaResult,
} from '../../lib/lookupTeAka'
import { CourseLessonWordCard } from './CoursesVocabularyWordCards'

export const courseLessonWordsQueryKey = (courseId: number) =>
  ['course_lesson_words', courseId] as const

const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

const MAX_TE_AKA_ON_LESSONS = 120

type PosType = { id: number; code: string; label: string; color?: string | null }

type CourseWordRow = {
  id: number
  course_id: number
  word_text: string
  pos_type_id: number
}

type LessonWordRow = {
  word_text: string
  pos_type_id: number
  lesson_number: number
}

function vocabKey(wordText: string, posTypeId: number) {
  return `${wordText}\t${posTypeId}`
}

type CourseLessonsPanelProps = {
  courseId: number
  courseWordRows: CourseWordRow[]
  posTypes: PosType[]
  courseWordsLoading: boolean
  /** Same map as Course vocabulary (for rank labels & sort). */
  frequencyRankByWordText: Map<string, number | null>
  wordsLoading: boolean
}

export function CourseLessonsPanel({
  courseId,
  courseWordRows,
  posTypes,
  courseWordsLoading,
  frequencyRankByWordText,
  wordsLoading,
}: CourseLessonsPanelProps) {
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()
  const [activeLesson, setActiveLesson] = useState<number>(1)
  const [lessonPosTab, setLessonPosTab] = useState<string>('all')

  const posTypesForTabs = useMemo(() => {
    const k = posTypes.find((p) => p.code === 'KIWHA')
    const rest = posTypes
      .filter((p) => p.code !== 'KIWHA')
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return k ? [k, ...rest] : rest
  }, [posTypes])

  const lessonVocabTabs = useMemo(
    () => [{ id: 'all', label: 'All' }, ...posTypesForTabs.map((p) => ({ id: String(p.id), label: p.label }))],
    [posTypesForTabs]
  )

  const activeLessonPosLabel = useMemo(() => {
    if (lessonPosTab === 'all') return ''
    return posTypes.find((p) => String(p.id) === lessonPosTab)?.label ?? 'this type'
  }, [lessonPosTab, posTypes])

  const { data: lessonRows = [], isLoading: lessonRowsLoading } = useQuery({
    queryKey: courseLessonWordsQueryKey(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_lesson_words')
        .select('word_text, pos_type_id, lesson_number')
        .eq('course_id', courseId)
      if (error) throw error
      return (data ?? []) as LessonWordRow[]
    },
    staleTime: 60_000,
  })

  const lessonByKey = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of lessonRows) {
      m.set(vocabKey(r.word_text, r.pos_type_id), r.lesson_number)
    }
    return m
  }, [lessonRows])

  const assignMutation = useMutation({
    mutationFn: async (payload: {
      word_text: string
      pos_type_id: number
      lesson_number: number
    }) => {
      const { error } = await supabase.from('course_lesson_words').upsert(
        {
          course_id: courseId,
          word_text: payload.word_text,
          pos_type_id: payload.pos_type_id,
          lesson_number: payload.lesson_number,
        },
        { onConflict: 'course_id,word_text,pos_type_id' }
      )
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseLessonWordsQueryKey(courseId) })
      showDbConfirmation({
        tables: ['course_lesson_words'],
        details: ['Updated lesson assignment'],
      })
    },
    onError: (err) => window.alert(formatError(err)),
  })

  const unassignMutation = useMutation({
    mutationFn: async (payload: { word_text: string; pos_type_id: number }) => {
      const { error } = await supabase
        .from('course_lesson_words')
        .delete()
        .eq('course_id', courseId)
        .eq('word_text', payload.word_text)
        .eq('pos_type_id', payload.pos_type_id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseLessonWordsQueryKey(courseId) })
      showDbConfirmation({
        tables: ['course_lesson_words'],
        details: ['Removed word from lesson schedule'],
      })
    },
    onError: (err) => window.alert(formatError(err)),
  })

  const rankOf = (wt: string) => frequencyRankByWordText.get(normalizeWordRegistryKey(wt)) ?? null

  const filteredSorted = useMemo(() => {
    let rows =
      lessonPosTab === 'all'
        ? [...courseWordRows]
        : courseWordRows.filter((w) => String(w.pos_type_id) === lessonPosTab)
    rows.sort((a, b) =>
      compareByFrequencyRankThenWordText(
        a.word_text,
        rankOf(a.word_text),
        b.word_text,
        rankOf(b.word_text)
      )
    )
    return rows
  }, [courseWordRows, lessonPosTab, frequencyRankByWordText])

  const teAkaSlice = useMemo(
    () => filteredSorted.slice(0, MAX_TE_AKA_ON_LESSONS),
    [filteredSorted]
  )

  const teAkaLessonQueries = useQueries({
    queries: teAkaSlice.map((w) => ({
      queryKey: teAkaLookupQueryKey(w.word_text),
      queryFn: () => lookupTeAka(w.word_text),
      select: (res: TeAkaResult | null) => teAkaResultHasAudio(res),
      staleTime: 86_400_000,
      gcTime: 7 * 86_400_000,
      enabled: !wordsLoading && teAkaSlice.length > 0,
    })),
  })

  const scheduleBusy = assignMutation.isPending || unassignMutation.isPending

  if (courseWordsLoading || lessonRowsLoading) {
    return <p className="text-sm text-gray-500 py-4">Loading lesson schedule…</p>
  }

  if (courseWordRows.length === 0) {
    return (
      <p className="text-sm text-gray-600 py-4 border-t">
        Add words to this course on the <strong>Vocabulary</strong> tab first, then assign them to lessons here.
      </p>
    )
  }

  return (
    <div className="pt-4 border-t space-y-3">
      <p className="text-xs text-gray-500 m-0">
        Filter by word type like Vocabulary, choose <strong>Lesson {activeLesson}</strong> above, then{' '}
        <strong>click the word row</strong> to add it to this week, move it here from another lesson, or remove it if it
        is already in this week.
      </p>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-1">
        {LESSON_NUMBERS.map((n) => {
          const count = courseWordRows.filter(
            (w) => lessonByKey.get(vocabKey(w.word_text, w.pos_type_id)) === n
          ).length
          const isSel = activeLesson === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => setActiveLesson(n)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-t border border-b-0 ${
                isSel
                  ? 'bg-white border-gray-200 text-gray-900 -mb-px z-[1]'
                  : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              Lesson {n}
              <span className="text-gray-400 ml-1">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b">
        {lessonVocabTabs.map((tab) => {
          const isAll = tab.id === 'all'
          const pos = !isAll ? posTypes.find((p) => String(p.id) === tab.id) : null
          const color = pos ? getPosTypeBackgroundColor(pos.color) : null
          const selected = lessonPosTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLessonPosTab(tab.id)}
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

      {!filteredSorted.length ? (
        <p className="text-sm text-gray-500">
          {lessonPosTab === 'all'
            ? 'No words on this course.'
            : `No words on this course tagged as ${activeLessonPosLabel}.`}
        </p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-2">
          {filteredSorted.map((w, i) => {
            const tok = resolveToken(
              { index: 0, text: '', pos_type_id: w.pos_type_id, word_pos_entry_id: null },
              posTypes
            )
            const rk = rankOf(w.word_text)
            const rankLabel = rk != null ? String(rk) : '?'
            const aq = i < teAkaLessonQueries.length ? teAkaLessonQueries[i] : undefined
            const audioPending = aq?.isPending
            const audioYes = aq?.data === true
            const scheduled = lessonByKey.get(vocabKey(w.word_text, w.pos_type_id)) ?? null
            return (
              <CourseLessonWordCard
                key={vocabKey(w.word_text, w.pos_type_id)}
                rowId={w.id}
                wordText={w.word_text}
                posLabel={tok.posLabel}
                frequencyRankLabel={rankLabel}
                underlineColor={tok.underlineColor}
                audioPending={audioPending}
                audioYes={audioYes}
                activeLesson={activeLesson}
                scheduledLesson={scheduled}
                scheduleBusy={scheduleBusy}
                onAssignToActiveLesson={() =>
                  assignMutation.mutate({
                    word_text: w.word_text,
                    pos_type_id: w.pos_type_id,
                    lesson_number: activeLesson,
                  })
                }
                onUnassignLesson={() =>
                  unassignMutation.mutate({
                    word_text: w.word_text,
                    pos_type_id: w.pos_type_id,
                  })
                }
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
