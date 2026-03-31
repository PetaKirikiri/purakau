/**
 * Client for Te Aka Māori Dictionary lookup via Supabase Edge Function.
 * Uses direct fetch (like r2.ts) since supabase.functions.invoke can fail in browser.
 */

import { parseTeAkaAudioOnly } from './teAkaAudioFromHtml'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://vuxeemwxdldfjybzgtxc.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export type TeAkaEntry = {
  pos: string
  definition: string
  example?: string
}

const TE_AKA_AUDIO_BASE = 'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public'

export function teAkaAudioUrlFromWordId(wordId: string | number): string {
  return `${TE_AKA_AUDIO_BASE}/${wordId}.mp3`
}

/** Use Supabase proxy so Audio() works without CORS/auth headers (verify_jwt=false on te-aka-audio). */
export function teAkaPlayableAudioUrl(wordId: string | number): string {
  const base = SUPABASE_URL.replace(/\/$/, '')
  return `${base}/functions/v1/te-aka-audio?id=${encodeURIComponent(String(wordId))}`
}

/** Prefer wordId; else parse Te Aka GCS URL; fallback empty. */
export function resolveTeAkaPlayableUrl(opts: {
  wordId?: string | number
  storedOrDirectUrl?: string
}): string {
  if (opts.wordId != null) return teAkaPlayableAudioUrl(opts.wordId)
  const u = opts.storedOrDirectUrl?.trim() ?? ''
  const m = u.match(/\/(\d+)\.mp3(?:\?|$)/)
  if (m) return teAkaPlayableAudioUrl(m[1])
  return u
}

export type TeAkaResult = {
  word: string
  entries: TeAkaEntry[]
  sourceUrl: string
  audioUrl?: string | null
  /** Te Aka dictionary entry id (for audio URL if audioUrl omitted) */
  wordId?: string | number | null
  /** Present when Edge Function includes audio scraper; use to verify deploy */
  scraperBuild?: string | null
}

/** Shared TanStack Query key for full Te Aka lookup (Words page + popover). */
export function teAkaLookupQueryKey(word: string) {
  return ['te_aka', 'lookup', word.trim().toLowerCase()] as const
}

/** True when Te Aka returned an audio id or URL (not every lemma has a sound file). */
export function teAkaResultHasAudio(r: TeAkaResult | null): boolean {
  if (!r) return false
  if (r.wordId != null && String(r.wordId).trim() !== '') return true
  if (typeof r.audioUrl === 'string' && r.audioUrl.trim() !== '') return true
  return false
}

const CLIENT_SCRAPE =
  import.meta.env.DEV || import.meta.env.VITE_TE_AKA_CLIENT_SCRAPE === 'true'

export async function lookupTeAka(word: string): Promise<TeAkaResult | null> {
  const q = word.trim().toLowerCase()
  if (!q) return null
  const url = `${SUPABASE_URL}/functions/v1/lookup-te-aka`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ word: q }),
  })
  const data = (await res.json().catch(() => ({}))) as TeAkaResult | { error: string }
  if (!res.ok || !data || typeof data !== 'object' || 'error' in data) return null
  let result = data as TeAkaResult
  const missingAudio =
    (result.wordId == null || result.wordId === '') &&
    (result.audioUrl == null || result.audioUrl === '') &&
    (result.entries?.length ?? 0) > 0
  if (CLIENT_SCRAPE && missingAudio && typeof fetch !== 'undefined') {
    try {
      const html = await fetch(`/api/te-aka/search?keywords=${encodeURIComponent(q)}`, {
        headers: { Accept: 'text/html' },
      }).then((r) => {
        if (!r.ok) throw new Error(`proxy ${r.status}`)
        return r.text()
      })
      const { wordId, audioUrl } = parseTeAkaAudioOnly(html, q)
      if (wordId && audioUrl) {
        result = {
          ...result,
          wordId,
          audioUrl,
          scraperBuild: result.scraperBuild ?? 'client-vite-proxy',
        }
      }
    } catch {
      /* ignore */
    }
  }
  return result
}
