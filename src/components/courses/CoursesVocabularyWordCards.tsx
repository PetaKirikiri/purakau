import type { ReactNode } from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HiChevronDown, HiSpeakerWave } from 'react-icons/hi2'
import {
  SubCategoryCatEditor,
  SubCategoryCatToggle,
  type SubCategoryRow,
} from '../VocabularySubCategoryUi'
import { TokenWord } from '../TokenWord'
import { lookupTeAka, teAkaLookupQueryKey } from '../../lib/lookupTeAka'
import { stripPunctuationFromWord } from '../../lib/tokens'

export type CoursesSubCategoryRow = SubCategoryRow

function teAkaGlossLine(e: { definition: string; example?: string }): string {
  const definitionClean = e.definition
    .replace(/^\s*(?:\([^)]+\)\s*)+/, '')
    .trim()
    .replace(/\s+/g, ' ')
  const shortGloss = definitionClean.includes(' - ')
    ? definitionClean.split(' - ')[0]?.trim()
    : null
  const exampleEnglish = e.example?.includes('—') ? e.example.split('—')[1]?.trim() : null
  return shortGloss ?? exampleEnglish ?? definitionClean
}

function CoursesWordDetailsSection({
  wordText,
  open,
  posLabel,
  frequencyRankLabel,
}: {
  wordText: string
  open: boolean
  posLabel: string | null
  frequencyRankLabel: string
}) {
  const wordNorm = wordText ? stripPunctuationFromWord(wordText).toLowerCase() : ''
  const { data: teAkaData, isPending } = useQuery({
    queryKey: teAkaLookupQueryKey(wordNorm),
    queryFn: () => lookupTeAka(wordNorm),
    enabled: open && !!wordNorm,
    staleTime: 86_400_000,
    gcTime: 7 * 86_400_000,
  })
  if (!open) return null
  return (
    <div
      data-course-word-details
      className="border-t border-gray-200/90 px-3 py-2 space-y-1.5 text-xs bg-white/90"
    >
      <div className="space-y-0.5 text-gray-600">
        {posLabel ? (
          <p>
            <span className="font-semibold text-gray-700">Word type</span> {posLabel}
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-gray-700">Frequency rank</span> {frequencyRankLabel}
        </p>
      </div>
      {isPending ? <p className="text-gray-500 italic">Loading Te Aka…</p> : null}
      {!isPending && teAkaData === null ? (
        <p className="text-gray-500 italic">No Te Aka dictionary entry for this search.</p>
      ) : null}
      {teAkaData ? (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-gray-900">{teAkaData.word}</span>
            <a
              href={teAkaData.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-blue-600 hover:underline"
            >
              Open on Te Aka
            </a>
          </div>
          <ul className="m-0 pl-4 list-disc space-y-1 text-gray-700">
            {teAkaData.entries.slice(0, 5).map((e, i) => (
              <li key={i}>
                {e.pos ? <span className="text-gray-500 mr-1">{e.pos}</span> : null}
                {teAkaGlossLine(e)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export type CoursesOnCourseWordCardProps = {
  rowId: string | number
  wordText: string
  /** POS label for this row (e.g. for details panel). */
  posLabel?: string | null
  /** `word_registry.frequency_rank`, or "?" if unset. */
  frequencyRankLabel: string
  underlineColor: string | undefined
  audioPending: boolean
  audioYes: boolean
  onRemove: () => void
  removeDisabled: boolean
  /** Course pill buttons — same row as the word, right side (`data-course-tag-pill`). */
  coursePills: ReactNode
  subCategoriesAssigned?: CoursesSubCategoryRow[]
  onUnassignSubCategory?: (subCategoryId: number) => void
  onCreateSubCategory?: (displayName: string) => void
  subCategoryBusy?: boolean
}

/** Word already on a course — `/courses` only. Style via `courses-on-course-word-card`. */
export function CoursesOnCourseWordCard({
  rowId,
  wordText,
  posLabel = null,
  frequencyRankLabel,
  underlineColor,
  audioPending,
  audioYes,
  onRemove,
  removeDisabled,
  coursePills,
  subCategoriesAssigned = [],
  onUnassignSubCategory,
  onCreateSubCategory,
  subCategoryBusy,
}: CoursesOnCourseWordCardProps) {
  const [catOpen, setCatOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const showCat = onUnassignSubCategory && onCreateSubCategory

  return (
    <li
      data-vocab-word-row={rowId}
      data-courses-on-course-word-card
      data-course-vocab-card
      className="courses-on-course-word-card course-vocab-card w-full rounded-lg border-2 border-sky-200/90 bg-gradient-to-br from-sky-50/80 to-white shadow-sm flex flex-col overflow-hidden list-none"
    >
      <div className="flex items-stretch min-h-[3rem] gap-1">
        <button
          type="button"
          data-course-vocab-remove-row
          aria-label={`Remove ${wordText} from this course`}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-3 text-left cursor-pointer select-none hover:bg-sky-100/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-inset disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          disabled={removeDisabled}
          onClick={(e) => {
            e.stopPropagation()
            // #region agent log
            fetch('http://127.0.0.1:7489/ingest/b001ac32-8358-43d0-a2cd-b6f88c884101', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '3a0348',
              },
              body: JSON.stringify({
                sessionId: '3a0348',
                hypothesisId: 'REMCLK',
                location: 'CoursesVocabularyWordCards.tsx:onCourseMainBtn',
                message: 'on_course_main_click',
                data: { removeDisabled, rowId, branch: 'remove_from_course' },
                timestamp: Date.now(),
              }),
            }).catch(() => {})
            // #endregion
            if (removeDisabled) return
            onRemove()
          }}
        >
          <div className="flex items-start gap-2 min-w-0 pointer-events-none">
            <span className="min-w-0 inline-block max-w-full">
              <TokenWord
                text={wordText}
                underlineColor={underlineColor}
                className="font-medium text-sky-950 break-words [overflow-wrap:anywhere]"
              />
            </span>
            <span
              className="shrink-0 mt-0.5 text-xs font-mono tabular-nums text-sky-800/80 font-semibold min-w-[1.25rem] text-center"
              title="Frequency rank in word_registry (lower = more common). ? = no rank."
            >
              {frequencyRankLabel}
            </span>
            <span
              className="shrink-0 inline-flex mt-0.5"
              title={
                audioPending
                  ? 'Checking Te Aka audio…'
                  : audioYes
                    ? 'Te Aka has pronunciation audio'
                    : 'No Te Aka pronunciation audio'
              }
            >
              <HiSpeakerWave
                className={`w-5 h-5 ${
                  audioPending ? 'text-gray-400' : audioYes ? 'text-green-600' : 'text-red-500'
                }`}
                aria-hidden
              />
            </span>
          </div>
        </button>
        <button
          type="button"
          data-course-word-details-toggle
          title="Dictionary: word type, frequency rank, and Te Aka meanings"
          className="shrink-0 px-1.5 flex flex-col items-center justify-center gap-0.5 py-1 text-sky-800 hover:bg-sky-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 rounded self-stretch min-w-[3rem]"
          aria-expanded={detailsOpen}
          aria-label={
            detailsOpen
              ? `Hide dictionary details for ${wordText}`
              : `Show dictionary details for ${wordText}`
          }
          onClick={(e) => {
            e.stopPropagation()
            setDetailsOpen((v) => !v)
          }}
        >
          <HiChevronDown
            className={`w-5 h-5 transition-transform duration-200 shrink-0 ${detailsOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="text-[10px] font-medium leading-none text-sky-900/90">Dictionary</span>
        </button>
        <div
          role="presentation"
          data-course-tag-pills-row
          className="shrink-0 flex flex-wrap items-center justify-end gap-1.5 py-2 pl-1 pr-2 max-w-[11rem] sm:max-w-[16rem] md:max-w-[20rem] pointer-events-auto self-center"
          onClick={(e) => e.stopPropagation()}
        >
          {coursePills}
        </div>
        {showCat ? (
          <div
            className="shrink-0 self-center px-1 pointer-events-auto"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
          >
            <SubCategoryCatToggle open={catOpen} onToggle={() => setCatOpen((v) => !v)} />
          </div>
        ) : null}
      </div>
      {showCat ? (
        <SubCategoryCatEditor
          open={catOpen}
          subCategoriesAssigned={subCategoriesAssigned}
          onUnassignSubCategory={onUnassignSubCategory}
          onCreateSubCategory={onCreateSubCategory}
          subCategoryBusy={subCategoryBusy}
          className="px-3 pb-2 bg-white/60"
        />
      ) : null}
      <CoursesWordDetailsSection
        wordText={wordText}
        open={detailsOpen}
        posLabel={posLabel}
        frequencyRankLabel={frequencyRankLabel}
      />
    </li>
  )
}

export type CoursesRegistryWordCardProps = {
  wordText: string
  /** POS label for this pick row. */
  posLabel?: string | null
  /** `word_registry.frequency_rank`, or "?" if unset. */
  frequencyRankLabel: string
  /** Visible: which course this click will add the word to. */
  targetCourseName: string
  underlineColor: string | undefined
  audioPending: boolean
  audioYes: boolean
  addDisabled: boolean
  onAdd: () => void
  ariaLabel?: string
  subCategoriesAssigned?: CoursesSubCategoryRow[]
  onUnassignSubCategory?: (subCategoryId: number) => void
  onCreateSubCategory?: (displayName: string) => void
  subCategoryBusy?: boolean
  /** Shown when the word is in word_registry but not yet tagged with this POS on the Words page. */
  registryAddHint?: string
}

/** Registry word to add to the course — `/courses` only. Style via `courses-registry-word-card`. */
export function CoursesRegistryWordCard({
  wordText,
  posLabel = null,
  frequencyRankLabel,
  targetCourseName,
  underlineColor,
  audioPending,
  audioYes,
  addDisabled,
  onAdd,
  ariaLabel,
  subCategoriesAssigned = [],
  onUnassignSubCategory,
  onCreateSubCategory,
  subCategoryBusy,
  registryAddHint,
}: CoursesRegistryWordCardProps) {
  const [catOpen, setCatOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const showCat = onUnassignSubCategory && onCreateSubCategory

  return (
    <li
      data-courses-registry-word-card
      data-registry-vocab-pick-card
      className="courses-registry-word-card registry-vocab-card w-full rounded-lg border border-dashed border-gray-300 bg-gray-50/70 list-none overflow-hidden shadow-none"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-stretch min-h-[3rem] gap-0">
          <button
            type="button"
            disabled={addDisabled}
            aria-label={ariaLabel ?? `Add ${wordText} to ${targetCourseName}`}
            className={`flex-1 min-w-0 p-3 flex items-center text-left cursor-pointer select-none hover:bg-gray-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60 focus-visible:ring-inset ${
              addDisabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''
            }`}
            onClick={() => {
              if (addDisabled) return
              onAdd()
            }}
          >
            <div className="flex items-start gap-2 min-w-0 pointer-events-none">
              <span className="min-w-0 inline-block max-w-full">
                <TokenWord
                  text={wordText}
                  underlineColor={underlineColor}
                  className="font-medium text-gray-900 break-words [overflow-wrap:anywhere]"
                />
              </span>
              <span
                className="shrink-0 mt-0.5 text-xs font-mono tabular-nums text-slate-600 font-semibold min-w-[1.25rem] text-center"
                title="Frequency rank in word_registry (lower = more common). ? = no rank."
              >
                {frequencyRankLabel}
              </span>
              <span
                className="shrink-0 inline-flex mt-0.5"
                title={
                  audioPending
                    ? 'Checking Te Aka audio…'
                    : audioYes
                      ? 'Te Aka has pronunciation audio'
                      : 'No Te Aka pronunciation audio'
                }
              >
                <HiSpeakerWave
                  className={`w-5 h-5 ${
                    audioPending ? 'text-gray-400' : audioYes ? 'text-green-600' : 'text-red-500'
                  }`}
                  aria-hidden
                />
              </span>
            </div>
          </button>
          <button
            type="button"
            data-course-word-details-toggle
            title="Dictionary: word type, frequency rank, and Te Aka meanings"
            className="shrink-0 px-1.5 flex flex-col items-center justify-center gap-0.5 py-1 border-l border-dashed border-gray-300 bg-gray-50/90 text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 self-stretch min-w-[3rem]"
            aria-expanded={detailsOpen}
            aria-label={
              detailsOpen
                ? `Hide dictionary details for ${wordText}`
                : `Show dictionary details for ${wordText}`
            }
            onClick={(e) => {
              e.stopPropagation()
              setDetailsOpen((v) => !v)
            }}
          >
            <HiChevronDown
              className={`w-5 h-5 transition-transform duration-200 shrink-0 ${detailsOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
            <span className="text-[10px] font-medium leading-none text-gray-800">Dictionary</span>
          </button>
          {showCat ? (
            <div
              className="shrink-0 self-stretch flex items-center px-2 border-l border-dashed border-gray-300 bg-gray-50/90"
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              <SubCategoryCatToggle open={catOpen} onToggle={() => setCatOpen((v) => !v)} />
            </div>
          ) : null}
        </div>
        <CoursesWordDetailsSection
          wordText={wordText}
          open={detailsOpen}
          posLabel={posLabel}
          frequencyRankLabel={frequencyRankLabel}
        />
        {registryAddHint ? (
          <p className="px-3 text-xs text-gray-600 -mt-0.5">{registryAddHint}</p>
        ) : null}
        {showCat ? (
          <SubCategoryCatEditor
            open={catOpen}
            subCategoriesAssigned={subCategoriesAssigned}
            onUnassignSubCategory={onUnassignSubCategory}
            onCreateSubCategory={onCreateSubCategory}
            subCategoryBusy={subCategoryBusy}
            className="px-3"
          />
        ) : null}
        <div data-registry-target-course className="px-3 pb-2">
          <span className="courses-registry-target-label">Adding to</span>
          <span className="courses-registry-target-name">{targetCourseName}</span>
        </div>
      </div>
    </li>
  )
}

export type CourseLessonWordCardProps = {
  rowId: string | number
  wordText: string
  posLabel: string | null
  frequencyRankLabel: string
  underlineColor: string | undefined
  audioPending: boolean
  audioYes: boolean
  activeLesson: number
  /** null = not on any lesson schedule */
  scheduledLesson: number | null
  scheduleBusy: boolean
  onAssignToActiveLesson: () => void
  onUnassignLesson: () => void
}

/** Course word row for Lessons tab — main row tap adds / moves / removes for the active lesson (like Vocabulary). */
export function CourseLessonWordCard({
  rowId,
  wordText,
  posLabel = null,
  frequencyRankLabel,
  underlineColor,
  audioPending,
  audioYes,
  activeLesson,
  scheduledLesson,
  scheduleBusy,
  onAssignToActiveLesson,
  onUnassignLesson,
}: CourseLessonWordCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const inThis = scheduledLesson != null && scheduledLesson === activeLesson
  const elsewhere = scheduledLesson != null && scheduledLesson !== activeLesson

  const scheduleTitle = inThis
    ? `Remove from lesson ${activeLesson}`
    : elsewhere
      ? `Move from lesson ${scheduledLesson} to lesson ${activeLesson}`
      : `Add to lesson ${activeLesson}`

  const scheduleAria =
    inThis
      ? `Remove ${wordText} from lesson ${activeLesson}`
      : elsewhere
        ? `Move ${wordText} from lesson ${scheduledLesson} to lesson ${activeLesson}`
        : `Add ${wordText} to lesson ${activeLesson}`

  return (
    <li
      data-vocab-word-row={rowId}
      data-course-lesson-word-card
      data-course-vocab-card
      className="courses-on-course-word-card course-vocab-card w-full rounded-lg border-2 border-sky-200/90 bg-gradient-to-br from-sky-50/80 to-white shadow-sm flex flex-col overflow-hidden list-none"
    >
      <div className="flex items-stretch min-h-[3rem] gap-1">
        <button
          type="button"
          data-course-lesson-schedule-row
          title={scheduleTitle}
          aria-label={scheduleAria}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-3 text-left cursor-pointer select-none hover:bg-sky-100/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-inset disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          disabled={scheduleBusy}
          onClick={(e) => {
            e.stopPropagation()
            if (scheduleBusy) return
            if (inThis) onUnassignLesson()
            else onAssignToActiveLesson()
          }}
        >
          <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 pointer-events-none">
            <span className="min-w-0 inline-block max-w-full">
              <TokenWord
                text={wordText}
                underlineColor={underlineColor}
                className="font-medium text-sky-950 break-words [overflow-wrap:anywhere]"
              />
            </span>
            <span
              className="shrink-0 mt-0.5 text-xs font-mono tabular-nums text-sky-800/80 font-semibold min-w-[1.25rem] text-center"
              title="Frequency rank in word_registry (lower = more common). ? = no rank."
            >
              {frequencyRankLabel}
            </span>
            <span
              className="shrink-0 inline-flex mt-0.5"
              title={
                audioPending
                  ? 'Checking Te Aka audio…'
                  : audioYes
                    ? 'Te Aka has pronunciation audio'
                    : 'No Te Aka pronunciation audio'
              }
            >
              <HiSpeakerWave
                className={`w-5 h-5 ${
                  audioPending ? 'text-gray-400' : audioYes ? 'text-green-600' : 'text-red-500'
                }`}
                aria-hidden
              />
            </span>
            {inThis ? (
              <span className="text-[10px] font-medium text-sky-900/90 bg-sky-100/90 px-1.5 py-0.5 rounded ml-auto">
                Lesson {activeLesson}
              </span>
            ) : elsewhere ? (
              <span className="text-[10px] font-medium text-gray-700 bg-gray-100/90 px-1.5 py-0.5 rounded ml-auto">
                Lesson {scheduledLesson}
              </span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          data-course-word-details-toggle
          title="Dictionary: word type, frequency rank, and Te Aka meanings"
          className="shrink-0 px-1.5 flex flex-col items-center justify-center gap-0.5 py-1 text-sky-800 hover:bg-sky-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 rounded self-stretch min-w-[3rem]"
          aria-expanded={detailsOpen}
          aria-label={
            detailsOpen
              ? `Hide dictionary details for ${wordText}`
              : `Show dictionary details for ${wordText}`
          }
          onClick={(e) => {
            e.stopPropagation()
            setDetailsOpen((v) => !v)
          }}
        >
          <HiChevronDown
            className={`w-5 h-5 transition-transform duration-200 shrink-0 ${detailsOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="text-[10px] font-medium leading-none text-sky-900/90">Dictionary</span>
        </button>
      </div>
      <CoursesWordDetailsSection
        wordText={wordText}
        open={detailsOpen}
        posLabel={posLabel}
        frequencyRankLabel={frequencyRankLabel}
      />
    </li>
  )
}
