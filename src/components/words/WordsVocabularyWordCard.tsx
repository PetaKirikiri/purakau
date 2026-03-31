import { useState } from 'react'
import { HiSpeakerWave } from 'react-icons/hi2'
import {
  SubCategoryCatEditor,
  SubCategoryCatToggle,
  type SubCategoryRow,
} from '../VocabularySubCategoryUi'
import { TokenWord } from '../TokenWord'

export type WordsVocabularyPosEntry = { pos_type_id: number; code: string; auto?: boolean }

export type WordsVocabularyPosType = { id: number; code: string; label: string; color?: string | null }

export type WordsSubCategoryRow = SubCategoryRow

export type WordsVocabularyWordCardProps = {
  wordText: string
  fromKiwahaLibrary?: boolean
  underlineColor: string | undefined
  audioPending: boolean
  audioYes: boolean
  posList: WordsVocabularyPosEntry[]
  posTypes: WordsVocabularyPosType[]
  onToggleAuto: (posTypeId: number, nextAuto: boolean) => void
  onRemoveCategory: (posTypeId: number) => void
  onDeleteWord: () => void
  deleteDisabled?: boolean
  /** Themes / sub-categories — omitted on kīwaha-only rows (no word_registry row). */
  subCategoriesAssigned?: WordsSubCategoryRow[]
  onUnassignSubCategory?: (subCategoryId: number) => void
  onCreateSubCategory?: (displayName: string) => void
  subCategoryBusy?: boolean
}

/** Visual word row for `/words` only — not used on Courses. Style via `words-vocabulary-word-card`. */
export function WordsVocabularyWordCard({
  wordText,
  fromKiwahaLibrary,
  underlineColor,
  audioPending,
  audioYes,
  posList,
  posTypes,
  onToggleAuto,
  onRemoveCategory,
  onDeleteWord,
  deleteDisabled,
  subCategoriesAssigned = [],
  onUnassignSubCategory,
  onCreateSubCategory,
  subCategoryBusy,
}: WordsVocabularyWordCardProps) {
  const [catOpen, setCatOpen] = useState(false)
  const showCatTools =
    !fromKiwahaLibrary && onUnassignSubCategory && onCreateSubCategory

  const posEntries = posList.filter((p) => p?.pos_type_id != null)
  const hasPos = posEntries.length > 0

  return (
    <li
      data-words-vocabulary-word-card
      data-words-page-word-card
      data-words-registry-no-pos={hasPos ? undefined : true}
      className="words-vocabulary-word-card words-page-word-card border rounded p-3 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col min-w-0 gap-0.5">
            <TokenWord text={wordText} underlineColor={underlineColor} className="font-medium" />
            {fromKiwahaLibrary ? (
              <span className="text-[10px] text-amber-800/90">
                Phrase library — run Sync from stories to mirror in word list
              </span>
            ) : null}
          </div>
          <span
            className="shrink-0 inline-flex"
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
        <span className="text-sm text-gray-600 flex items-center gap-1 flex-wrap justify-end">
          {hasPos ? (
            posEntries.map((p) => {
              const label = posTypes.find((pt) => pt.id === p.pos_type_id)?.label ?? p.code
              const isAuto = !!p.auto
              return (
                <span
                  key={p.pos_type_id}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => onToggleAuto(p.pos_type_id, !isAuto)}
                    className={`text-xs leading-none px-0.5 rounded ${
                      isAuto
                        ? 'bg-blue-200 text-blue-800 font-medium'
                        : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                    title={isAuto ? 'Auto-tag on (click to turn off)' : 'Auto-tag off (click to turn on)'}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCategory(p.pos_type_id)}
                    className="text-gray-500 hover:text-red-600 text-xs leading-none"
                    title={`Remove ${label}`}
                  >
                    ×
                  </button>
                </span>
              )
            })
          ) : (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold tracking-tight"
              title="No word type (POS) yet — pick a POS tab to add this word, or tag it in a story."
            >
              No POS
            </span>
          )}
          {showCatTools ? (
            <SubCategoryCatToggle open={catOpen} onToggle={() => setCatOpen((v) => !v)} className="ml-1" />
          ) : null}
          {!fromKiwahaLibrary ? (
            <button
              type="button"
              className="ml-1 text-xs text-red-600 hover:underline shrink-0"
              disabled={deleteDisabled}
              title="Remove this word from the registry"
              onClick={onDeleteWord}
            >
              Delete
            </button>
          ) : null}
        </span>
      </div>
      {showCatTools ? (
        <SubCategoryCatEditor
          open={catOpen}
          subCategoriesAssigned={subCategoriesAssigned}
          onUnassignSubCategory={onUnassignSubCategory!}
          onCreateSubCategory={onCreateSubCategory!}
          subCategoryBusy={subCategoryBusy}
          className="pl-1"
        />
      ) : null}
    </li>
  )
}
