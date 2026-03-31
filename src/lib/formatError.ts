/** Extract a readable message from various error shapes (Error, Supabase, etc.) */
export function formatError(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  const o = err as Record<string, unknown>
  if (typeof o?.message === 'string') return o.message
  if (typeof o?.error === 'string') return o.error
  if (typeof o?.error_description === 'string') return o.error_description
  if (typeof o?.details === 'string') return o.details
  try {
    const s = JSON.stringify(err)
    if (s !== '{}') return s
  } catch {
    // ignore
  }
  return 'Unknown error'
}
