#!/usr/bin/env node
/**
 * Debug script for Te Aka scrape. Mirrors Edge Function fetch+parse.
 * Run: node scripts/debug-te-aka-scrape.mjs
 */

const SERVER = 'http://127.0.0.1:7489/ingest/b001ac32-8358-43d0-a2cd-b6f88c884101'
const SESSION = '5585d8'

function log(location, message, data, hypothesisId) {
  const payload = {
    sessionId: SESSION,
    location,
    message,
    data: data || {},
    timestamp: Date.now(),
    hypothesisId: hypothesisId || null,
  }
  fetch(SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {})
  console.log(`[${hypothesisId || '-'}] ${location}: ${message}`, data ? JSON.stringify(data) : '')
}

async function main() {
  const word = process.argv[2] || 'kei'
  const sourceUrl = `https://maoridictionary.co.nz/search?keywords=${encodeURIComponent(word)}`

  // H1: Different User-Agent returns different content
  // H2: Raw HTML contains definitions but in different structure
  // H3: Script removal removes definitions or leaves JS that matches our regex
  // H4: Regex matches JS before it matches real definitions (order of matches)
  // H5: Fetch returns empty/minimal HTML (blocked or error)

  log('debug-te-aka:1', 'fetch-start', { word, sourceUrl }, 'H5')
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Purakau/1.0 (Maori learning app)', Accept: 'text/html' },
  })
  log('debug-te-aka:2', 'fetch-response', { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') }, 'H5')

  const html = await res.text()
  log('debug-te-aka:3', 'html-received', { htmlLength: html.length, hasParticle: html.includes('(particle)'), hasDefinition: html.includes('at, on, in') }, 'H1')

  const scriptRe = new RegExp('<script[^>]*>[\\s\\S]*?</script>', 'gi')
  let text = html.replace(scriptRe, '')
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  log('debug-te-aka:4', 'after-script-and-tag-removal', { textLength: text.length, hasParticle: text.includes('(particle)'), firstDefinitionIdx: text.indexOf('1. (particle)'), sample: text.slice(text.indexOf('kei') || 0, (text.indexOf('kei') || 0) + 400) }, 'H3')

  const particleIdx = text.indexOf('(particle)')
  const contextAroundParticle =
    particleIdx >= 0 ? text.slice(Math.max(0, particleIdx - 300), particleIdx + 400) : '(not found)'
  log('debug-te-aka:5', 'context-around-particle', { particleIdx, contextAroundParticle }, 'H2')

  const textSample = text.slice(0, 2000)
  log('debug-te-aka:5b', 'text-sample-start', { sample: textSample.slice(0, 500) }, 'H2')

  const senseRe = new RegExp(
    '(\\d+)\\.\\s*\\(([^)]+)\\)\\s*([^.(]+(?:\\([^)]*\\)[^.(]*)*\\.)(?:\\s*\\([^)]*\\))?([\\s\\S]*?)(?=\\d+\\.\\s*\\(|$)',
    'g'
  )
  const matches = []
  let m
  while ((m = senseRe.exec(text))) {
    matches.push({ num: m[1], pos: m[2].trim(), def: m[3].trim().slice(0, 60), defLen: m[3].length })
    if (matches.length >= 8) break
  }
  log('debug-te-aka:6', 'sense-regex-matches', { count: matches.length, firstFive: matches.slice(0, 5) }, 'H2,H4')

  const altRe = new RegExp('\\(([^)]+)\\)\\s+([^.]+\\.)', 'g')
  const altMatches = []
  let alt
  while ((alt = altRe.exec(text)) && altMatches.length < 8) {
    altMatches.push({ pos: alt[1].trim(), def: alt[2].trim().slice(0, 50) })
  }
  log('debug-te-aka:7', 'alt-regex-matches', { count: altMatches.length, firstThree: altMatches.slice(0, 3) }, 'H2')

  log('debug-te-aka:8', 'done', { totalSenseMatches: matches.length }, null)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
