import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://vuxeemwxdldfjybzgtxc.supabase.co'

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options)
      return res
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastError
}

export async function invokeAuthFunction<T>(
  name: string,
  options: { body?: object; token?: string | null } = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = options.token ?? session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    const err = new Error(data?.error ?? res.statusText ?? 'Request failed')
    ;(err as Error & { hint?: string }).hint =
      res.status === 401
        ? 'Sign in to use this feature. If the project was paused, unpause it in the Supabase dashboard.'
        : res.status === 404
          ? 'Edge Function not found. Check deployment.'
          : undefined
    throw err
  }
  if (data?.error) {
    const err = new Error(data.error) as Error & { hint?: string }
    err.hint = (data as { hint?: string }).hint
    throw err
  }
  return data
}
