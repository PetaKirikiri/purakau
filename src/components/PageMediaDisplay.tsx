import { useState } from 'react'
import { ImageWithOverlays } from './ImageWithOverlays'
import { PageMediaQuestionCarousel } from './PageMediaQuestionCarousel'
import type { ImageTagLike } from '../lib/tokens'
import type { PosPattern } from '../lib/patternMatch'
import type { SentenceToken } from '../db/schema'
import type { PageMediaQuestionEditorContext } from './pageMediaQuestionEditorContext'

export type { PageMediaQuestionEditorContext }

export type ImageTag = ImageTagLike

export type PageMediaQuestion = {
  id: number
  page_media_id: number
  sort_order: number
  tokens_array: SentenceToken[] | null
}

export type PageMediaItem = {
  id: number
  url: string
  media_type?: string
  image_id?: number
  tags?: ImageTag[]
  usages?: { title_id?: number; version_id?: number; page_number: number }[]
  questions?: PageMediaQuestion[]
}

export type PageMediaQuestionHandlers = {
  canEdit: boolean
  onAdd: (pageMediaId: number) => void | Promise<void>
  onDelete: (questionId: number) => void | Promise<void>
  isAdding?: boolean
  isDeleting?: boolean
  /** Opens flow to insert rows from a story sentence + pattern question_config. */
  onGenerateFromSentence?: (pageMediaId: number) => void | Promise<void>
  isGeneratingFromSentence?: boolean
  /** When set, questions use SentenceDisplay + token POS / patterns / phrases like story rows. */
  editor?: PageMediaQuestionEditorContext | null
}

export function PageMediaDisplay({
  items,
  posTypes = [],
  chunkPatterns = [],
  onDelete,
  onEdit,
  isDeleting,
  questionHandlers,
}: {
  items: PageMediaItem[]
  posTypes?: { id: number; label?: string; color?: string | null }[]
  chunkPatterns?: PosPattern[]
  onDelete?: (id: number) => void
  onEdit?: (item: PageMediaItem) => void
  isDeleting?: boolean
  questionHandlers?: PageMediaQuestionHandlers
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-6 w-full items-stretch mb-6">
      {items.map((m) =>
        m.media_type === 'image' ? (
          <div
            key={m.id}
            className="relative group"
            onMouseLeave={() => setSelectedId(null)}
          >
            <button
              type="button"
              onClick={() => setSelectedId((prev) => (prev === m.id ? null : m.id))}
              className={`block w-full rounded ${selectedId === m.id ? 'ring-2 ring-blue-400' : ''}`}
            >
              <ImageWithOverlays url={m.url} tags={m.tags} posTypes={posTypes} chunkPatterns={chunkPatterns} large className="group-hover:opacity-90 transition" />
            </button>
            {(m.questions?.length ?? 0) > 0 || questionHandlers?.canEdit ? (
              <PageMediaQuestionCarousel
                questions={m.questions ?? []}
                posTypes={posTypes}
                canEdit={!!questionHandlers?.canEdit}
                onAdd={() => {
                  if (questionHandlers?.onAdd) void questionHandlers.onAdd(m.id)
                }}
                onDelete={(q) => {
                  if (questionHandlers?.onDelete) void questionHandlers.onDelete(q.id)
                }}
                onGenerateFromSentence={
                  questionHandlers?.onGenerateFromSentence
                    ? () => void questionHandlers.onGenerateFromSentence!(m.id)
                    : undefined
                }
                isGeneratingFromSentence={questionHandlers?.isGeneratingFromSentence}
                editor={questionHandlers?.editor ?? null}
              />
            ) : null}
            {selectedId === m.id && (
              <div className="absolute top-1 right-1 flex gap-1 bg-white/95 border rounded shadow-lg p-1">
                {onEdit && (
                  <button
                    type="button"
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    onClick={() => onEdit(m)}
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="px-2 py-1 text-xs border rounded border-red-200 text-red-700 hover:bg-red-50"
                    disabled={isDeleting}
                    onClick={() => onDelete(m.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            Media
          </a>
        )
      )}
    </div>
  )
}
