/**
 * Page block: Story → Chapters → Pages → Paragraphs → Sentences → Phrases → Words
 * Renders a page header, media, and children (typically sentences).
 * Use for story pages; things like image tags don't need page/paragraph context.
 */

import { PageMediaDisplay } from './PageMediaDisplay'
import type { PageMediaItem, PageMediaQuestionHandlers } from './PageMediaDisplay'
import type { PosPattern } from '../lib/patternMatch'

export type PageBlockProps = {
  pageNumber: number
  mediaItems: PageMediaItem[]
  onEditPageText: () => void
  onAddPicture: () => void
  onDeleteMedia?: (mediaId: number) => void
  onEditMedia?: (item: PageMediaItem) => void
  isDeletingMedia?: boolean
  posTypes?: { id: number; label?: string; color?: string | null }[]
  chunkPatterns?: PosPattern[]
  canEdit?: boolean
  isFirst?: boolean
  children?: React.ReactNode
  pageMediaQuestionHandlers?: PageMediaQuestionHandlers
}

export function PageBlock({
  pageNumber,
  mediaItems,
  onEditPageText,
  onAddPicture,
  onDeleteMedia,
  onEditMedia,
  isDeletingMedia = false,
  posTypes = [],
  chunkPatterns = [],
  canEdit = true,
  isFirst = false,
  children = null,
  pageMediaQuestionHandlers,
}: PageBlockProps) {
  return (
    <div
      className={`border-t-2 border-gray-300 pt-4 mb-2 ${isFirst ? 'mt-0 pt-0 border-t-0' : 'mt-6'}`}
      role="separator"
      aria-label={`Page ${pageNumber}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-gray-500">— Page {pageNumber} —</span>
        <div className="flex gap-1">
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canEdit}
            onClick={onEditPageText}
          >
            Edit page text
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
            onClick={onAddPicture}
          >
            Add picture
          </button>
        </div>
      </div>
      <PageMediaDisplay
        items={mediaItems}
        posTypes={posTypes}
        chunkPatterns={chunkPatterns}
        onDelete={onDeleteMedia}
        onEdit={onEditMedia}
        isDeleting={isDeletingMedia}
        questionHandlers={pageMediaQuestionHandlers}
      />
      {children}
    </div>
  )
}
