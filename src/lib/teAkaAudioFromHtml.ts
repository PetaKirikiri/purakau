/**
 * Mirrors supabase/functions/lookup-te-aka audio extraction for client-side fallback
 * (when deployed Edge is stale and omits wordId/audioUrl).
 */

const AUDIO_BASE = 'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public'

function headwordMatchesQuery(head: string | null, query: string): boolean {
  if (head == null) return false
  const a = head.toLowerCase()
  const b = query.toLowerCase()
  if (a === b) return true
  const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return strip(a) === strip(b)
}

function titleMatchesSearch(titleLine: string, query: string): boolean {
  const t = titleLine.trim().toLowerCase()
  if (headwordMatchesQuery(t, query)) return true
  const first = t.split(/\s+/)[0] ?? ''
  return headwordMatchesQuery(first, query)
}

function sectionAfterH2Open(html: string, h2MatchIndex: number): string {
  const start = h2MatchIndex
  const nextH2 = html.indexOf('<h2', start + 10)
  return nextH2 === -1 ? html.slice(start) : html.slice(start, nextH2)
}

function audioIdFromSection(section: string): string | null {
  const m =
    section.match(/word-audio-(\d+)/) ??
    section.match(/audioRef:\s*['"]word-audio-(\d+)['"]/) ??
    section.match(/maori-dictionary-prod2-web-assets\/public\/(\d+)\.mp3/)
  return m ? m[1] : null
}

function extractAudioForHeadword(html: string, searchWord: string): { wordId: string | null; audioUrl: string | null } {
  const q = searchWord.toLowerCase()
  const h2Re = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/gi
  let m: RegExpExecArray | null
  while ((m = h2Re.exec(html))) {
    const title = m[1].trim()
    if (!titleMatchesSearch(title, q)) continue
    const section = sectionAfterH2Open(html, m.index)
    const id = audioIdFromSection(section)
    if (!id) return { wordId: null, audioUrl: null }
    return { wordId: id, audioUrl: `${AUDIO_BASE}/${id}.mp3` }
  }
  return { wordId: null, audioUrl: null }
}

function extractAudioFromFirstSearchResult(html: string): { wordId: string | null; audioUrl: string | null } {
  const h2Re = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>/gi
  const m = h2Re.exec(html)
  if (!m) return { wordId: null, audioUrl: null }
  const section = sectionAfterH2Open(html, m.index)
  const id = audioIdFromSection(section)
  if (!id) return { wordId: null, audioUrl: null }
  return { wordId: id, audioUrl: `${AUDIO_BASE}/${id}.mp3` }
}

/** Same first-pass logic as Edge parseTeAkaHtml (audio only). */
export function parseTeAkaAudioOnly(html: string, searchWord: string): { wordId: string | null; audioUrl: string | null } {
  let { wordId, audioUrl } = extractAudioForHeadword(html, searchWord)
  if (!wordId || !audioUrl) {
    const first = extractAudioFromFirstSearchResult(html)
    if (first.wordId && first.audioUrl) {
      wordId = first.wordId
      audioUrl = first.audioUrl
    }
  }
  return { wordId, audioUrl }
}
