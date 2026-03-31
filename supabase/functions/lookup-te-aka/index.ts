const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

type TeAkaEntry = { pos: string; definition: string; example?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  let word = url.searchParams.get('word') ?? ''
  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as { word?: string }
      if (body?.word) word = body.word
    } catch {
      /* ignore */
    }
  }
  const q = word.trim().toLowerCase()
  if (!q) {
    return new Response(
      JSON.stringify({ error: 'Missing or empty word parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const sourceUrl = `https://maoridictionary.co.nz/search?keywords=${encodeURIComponent(q)}`

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Purakau/1.0 (Maori learning app)',
        Accept: 'text/html',
      },
    })
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Te Aka returned ${res.status}`, sourceUrl }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const html = await res.text()
    const { entries, audioUrl, wordId } = parseTeAkaHtml(html, q)
    return new Response(
      JSON.stringify({
        word: q,
        entries: entries.slice(0, 5),
        sourceUrl,
        audioUrl: audioUrl ?? null,
        wordId: wordId ?? null,
        scraperBuild: SCRAPER_BUILD,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message, sourceUrl }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

const AUDIO_BASE = 'https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public'
/** Bump when scraper logic changes (client can log to verify deploy). */
const SCRAPER_BUILD = '2026-03-24a'

/** Compare headwords when Te Aka uses macrons and the query does not (or vice versa). */
function headwordMatchesQuery(head: string | null, query: string): boolean {
  if (head == null) return false
  const a = head.toLowerCase()
  const b = query.toLowerCase()
  if (a === b) return true
  const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return strip(a) === strip(b)
}

/** Te Aka often uses "tētahi ... tētahi" — first token is the lemma. */
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

/** Exact headword match (title in h2 must equal search query). */
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

/**
 * First search-result block (same DOM order as Te Aka). Use when exact title match fails
 * (e.g. user typed "hikoi" but Te Aka shows "hīkoi" — same as first hit on the site).
 */
function extractAudioFromFirstSearchResult(html: string): { wordId: string | null; audioUrl: string | null } {
  const h2Re = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>/gi
  const m = h2Re.exec(html)
  if (!m) return { wordId: null, audioUrl: null }
  const section = sectionAfterH2Open(html, m.index)
  const id = audioIdFromSection(section)
  if (!id) return { wordId: null, audioUrl: null }
  return { wordId: id, audioUrl: `${AUDIO_BASE}/${id}.mp3` }
}

function parseTeAkaHtml(html: string, searchWord: string): { entries: TeAkaEntry[]; audioUrl: string | null; wordId: string | null } {
  const entries: TeAkaEntry[] = []
  let { wordId, audioUrl } = extractAudioForHeadword(html, searchWord)
  if (!wordId || !audioUrl) {
    const first = extractAudioFromFirstSearchResult(html)
    if (first.wordId && first.audioUrl) {
      wordId = first.wordId
      audioUrl = first.audioUrl
    }
  }

  const scriptRe = new RegExp('<script[^>]*>[\\s\\S]*?</script>', 'gi')
  let text = html.replace(scriptRe, '')
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const senseRe = new RegExp(
    '(\\d+)\\.\\s*\\(([^)]+)\\)\\s*([^.(]+(?:\\([^)]*\\)[^.(]*)*\\.)(?:\\s*\\([^)]*\\))?([\\s\\S]*?)(?=\\d+\\.\\s*\\(|$)',
    'g'
  )
  let currentEntryWord: string | null = null
  let m: RegExpExecArray | null

  while ((m = senseRe.exec(text))) {
    const senseNum = parseInt(m[1], 10)
    if (senseNum === 1) {
      const before = text.slice(0, m.index).trim()
      currentEntryWord = before.split(/\s+/).pop()?.toLowerCase() ?? null
    }
    if (!headwordMatchesQuery(currentEntryWord, searchWord)) continue
    const pos = m[2].trim()
    const definition = m[3].trim()
    let example: string | undefined
    const tail = m[4] || ''
    const exRe = new RegExp(
      "([A-ZĀĒĪŌŪa-zāēīōū0-9\\s',\\-.;:!?]+?)\\s*\\/\\s*([^\\n\\/]+?)(?=\\s+[A-ZĀĒĪŌŪ]|\\s+Show|\\s+Hide|\\s+See|\\s+Synonyms|$)"
    )
    const exampleMatch = tail.match(exRe)
    if (exampleMatch) {
      const maori = exampleMatch[1].trim()
      const english = exampleMatch[2].trim()
      example = maori ? `${maori} — ${english}` : english
    }
    entries.push({ pos, definition, example })
  }
  return { entries, audioUrl, wordId }
}
