/**
 * Ensures a story has version 1.0 and backfills version_id on all related rows.
 * Call when loading a story that has no versions or has data with null version_id.
 */

import { supabase } from './supabase'

const RPC_TIMEOUT_MS = 8000

export async function ensureStoryVersionForTitle(titleId: number): Promise<{
  versionId: number
  label: string
  backfilled: boolean
}> {
  const rpcPromise = (async () => {
    const { data, error } = await supabase.rpc('ensure_story_version_for_title', {
      p_title_id: titleId,
    })
    if (error) throw error
    const r = data as Record<string, unknown>
    return {
      versionId: Number(r.version_id),
      label: String(r.label),
      backfilled: Boolean(r.backfilled),
    }
  })()
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Migration timed out. Run the SQL migration in Supabase first.')), RPC_TIMEOUT_MS)
  )
  return Promise.race([rpcPromise, timeoutPromise])
}
