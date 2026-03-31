/**
 * Story object model. Aligned with Supabase schema: chapters, pages, paragraphs, sentences, tokens.
 */

import type { SentenceToken } from '../db/schema'

/** A story row (sentence). Same shape for persisted and draft. */
export type StoryRow = {
  id: number | null
  version_id: number
  chapter_number: number | null
  page_number: number | null
  paragraph_number: number | null
  sentence_number: number
  sentence_text: string
  tokens_array: SentenceToken[] | null
}

export function isPersistedRow(row: StoryRow): row is StoryRow & { id: number } {
  return row.id != null
}
