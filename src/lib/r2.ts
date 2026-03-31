const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export type R2Image = { key: string; url: string }

export type R2ListError = {
  message: string
  status?: number
  statusText?: string
  source: 'supabase' | 'r2'
  detail?: string
}

export async function listR2Images(): Promise<R2Image[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/list-r2-images`, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>

  if (!res.ok) {
    const err: R2ListError = {
      message: (body.error as string) ?? (body.message as string) ?? res.statusText ?? 'Unknown error',
      status: res.status,
      statusText: res.statusText,
      source: res.status === 401 ? 'supabase' : 'r2',
      detail: JSON.stringify(body, null, 2),
    }
    if (res.status === 401) {
      err.message = 'Supabase rejected the request (401). Turn OFF "Verify JWT" for list-r2-images in Project Settings → Edge Functions.'
      err.detail = `Status: ${res.status}. Body: ${JSON.stringify(body)}. Redeploy with: npx supabase functions deploy list-r2-images`
    }
    const e = new Error(err.message) as Error & R2ListError
    Object.assign(e, err)
    throw e
  }
  if (body.error) {
    const debug = body.debug as Record<string, unknown> | undefined
    const msg = `${body.error}${debug?.hint ? ` — ${debug.hint}` : ''}`
    const e = new Error(msg) as Error & { detail?: string }
    e.detail = JSON.stringify(body, null, 2)
    throw e
  }
  return (body.images as R2Image[]) ?? []
}

export async function uploadR2Image(file: File): Promise<R2Image> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-r2-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: (() => {
      const fd = new FormData()
      fd.append('file', file)
      return fd
    })(),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (body.error as string) ?? res.statusText ?? 'Upload failed'
    throw new Error(msg)
  }
  return { key: body.key as string, url: body.url as string }
}
