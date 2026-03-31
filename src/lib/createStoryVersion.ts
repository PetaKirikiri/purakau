/**
 * Creates a new story version by copying all content from the base version.
 */

import { supabase } from './supabase'

export type CreateVersionResult = {
  id: number
  version_number: number
  label: string
}

export async function createStoryVersion(
  titleId: number,
  basedOnVersionId: number
): Promise<CreateVersionResult> {
  const { data, error } = await supabase.rpc('create_story_version', {
    p_title_id: titleId,
    p_based_on_version_id: basedOnVersionId,
  })
  if (error) throw error
  const result = data as Record<string, unknown>
  return {
    id: Number(result.id),
    version_number: Number(result.version_number),
    label: String(result.label),
  }
}
