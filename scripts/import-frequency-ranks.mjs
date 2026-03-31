#!/usr/bin/env node
/**
 * Import ranked word list into word_registry.frequency_rank.
 *
 * Usage:
 *   node scripts/import-frequency-ranks.mjs path/to/list.xlsx
 *   node scripts/import-frequency-ranks.mjs path/to/list.csv
 *   node scripts/import-frequency-ranks.mjs docs/frequency.numbers
 *
 * Apple Numbers (.numbers): uses Python + numbers-parser (see scripts/requirements-frequency.txt).
 *
 * Spreadsheet: one word per row; rank in one column, word/lemma in another.
 * (Rank 1 = most frequent.) Headers optional — e.g. "rank" + "word".
 * Normalization matches the word_registry DB trigger (lowercase, strip punctuation/spaces).
 *
 * - If word exists: updates frequency_rank only.
 * - If missing: inserts word_text, frequency_rank, empty pos_types, language mi.
 *
 * Env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *      (service role if RLS blocks updates to word_registry).
 */
import 'dotenv/config'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Mirror word_registry_normalize_word (PostgreSQL): lower, trim, remove punct + whitespace. */
function normalizeWordText(s) {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?"()[\]{}–—…\s]+/g, '')
}

function parseRankAndWord(cellA, cellB) {
  const a = String(cellA ?? '').trim()
  const b = String(cellB ?? '').trim()
  const rankA = parseInt(a.replace(/[,_\s]/g, ''), 10)
  if (Number.isFinite(rankA) && rankA >= 1 && b.length > 0 && !Number.isFinite(parseInt(b, 10))) {
    return { rank: rankA, word: b }
  }
  const rankB = parseInt(b.replace(/[,_\s]/g, ''), 10)
  if (Number.isFinite(rankB) && rankB >= 1 && a.length > 0) {
    return { rank: rankB, word: a }
  }
  return null
}

function loadPairsFromCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const pairs = []
  let start = 0
  if (lines.length > 0) {
    const low = lines[0].toLowerCase()
    if (/rank|word|lemma|frequency|#\s*,/i.test(low)) start = 1
  }
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''))
    if (parts.length < 2) continue
    const rw = parseRankAndWord(parts[0], parts[1])
    if (rw) pairs.push(rw)
  }
  return pairs
}

function loadPairsFromExcel(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  let startRow = 0
  let rankCol = 0
  let wordCol = 1

  if (rows.length > 0) {
    const header = rows[0].map((c) => String(c ?? '').toLowerCase().trim())
    const ri = header.findIndex((h) =>
      /^(rank|freq|frequency|#\s*no|no\.?|number|#)$/i.test(h) || h.includes('rank')
    )
    const wi = header.findIndex(
      (h) => h.includes('word') || h.includes('lemma') || h.includes('kupu') || h === 'orth' || h.includes('headword')
    )
    if (ri >= 0 && wi >= 0 && ri !== wi) {
      rankCol = ri
      wordCol = wi
      startRow = 1
    } else {
      const h0 = header[0] ?? ''
      if (/rank|freq|#\s*no|^no\.?$|number/i.test(h0) || h0 === '#') {
        startRow = 1
      }
    }
  }

  const pairs = []
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i]
    if (!Array.isArray(r) || r.length === 0) continue
    const rw = parseRankAndWord(r[rankCol], r[wordCol])
    if (rw) pairs.push(rw)
  }
  return pairs
}

/**
 * Apple Numbers — binary format; requires Python 3 + `pip install numbers-parser`.
 * Runs scripts/read-numbers-frequency.py (JSON lines: {"rank", "word"}).
 */
function loadPairsFromNumbers(filePath) {
  const pyScript = path.join(__dirname, 'read-numbers-frequency.py')
  const bins = ['python3', 'python']
  for (const bin of bins) {
    const r = spawnSync(bin, [pyScript, filePath], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (r.error && r.error.code === 'ENOENT') continue
    if (r.status === 2) {
      console.error(
        r.stderr ||
          'Missing Python module. Run: pip install -r scripts/requirements-frequency.txt'
      )
      process.exit(1)
    }
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout || `python exited ${r.status}`)
      process.exit(1)
    }
    const pairs = []
    for (const line of r.stdout.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const o = JSON.parse(t)
        if (o.rank != null && o.word != null) pairs.push({ rank: Number(o.rank), word: String(o.word) })
      } catch {
        /* skip */
      }
    }
    return pairs
  }
  console.error(
    'python3 not found. For .numbers files install Python 3, then:\n  pip install -r scripts/requirements-frequency.txt'
  )
  process.exit(1)
}

function mergeToBestRank(pairs) {
  /** @type {Map<string, number>} */
  const byWord = new Map()
  for (const { rank, word } of pairs) {
    const key = normalizeWordText(word)
    if (!key) continue
    const prev = byWord.get(key)
    if (prev == null || rank < prev) byWord.set(key, rank)
  }
  return byWord
}

async function main() {
  const fileArg = process.argv[2]
  if (!fileArg) {
    console.error('Usage: node scripts/import-frequency-ranks.mjs <file.xlsx|.xls|.csv|.numbers>')
    process.exit(1)
  }
  const abs = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg)
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs)
    process.exit(1)
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.PUBLISHABLE_KEY
  if (!url || !key) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(1)
  }

  const ext = path.extname(abs).toLowerCase()
  let pairs
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    pairs = loadPairsFromCsv(abs)
  } else if (ext === '.xlsx' || ext === '.xls' || ext === '.ods') {
    pairs = loadPairsFromExcel(abs)
  } else if (ext === '.numbers') {
    pairs = loadPairsFromNumbers(abs)
  } else {
    console.error('Unsupported extension:', ext, '(use .xlsx, .xls, .csv, .numbers)')
    process.exit(1)
  }

  const byWord = mergeToBestRank(pairs)
  const entries = [...byWord.entries()].sort((a, b) => a[1] - b[1])
  console.log(`Parsed ${pairs.length} rows → ${entries.length} unique normalized words.`)

  const supabase = createClient(url, key)
  const chunkSize = 150
  /** @type {Set<string>} */
  const existing = new Set()

  const keys = entries.map((e) => e[0])
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize)
    const { data, error } = await supabase.from('word_registry').select('word_text').in('word_text', chunk)
    if (error) {
      console.error('Select error:', error.message)
      process.exit(1)
    }
    for (const row of data ?? []) {
      existing.add(row.word_text)
    }
  }

  let updated = 0
  let inserted = 0
  let failed = 0

  for (const [wordText, frequency_rank] of entries) {
    if (existing.has(wordText)) {
      const { error } = await supabase.from('word_registry').update({ frequency_rank }).eq('word_text', wordText)
      if (error) {
        console.error(`Update "${wordText}":`, error.message)
        failed++
      } else {
        updated++
      }
    } else {
      const { error } = await supabase.from('word_registry').insert({
        word_text: wordText,
        frequency_rank,
        pos_types: [],
        metadata: {},
        language: 'mi',
      })
      if (error) {
        if (error.code === '23505') {
          const e2 = await supabase.from('word_registry').update({ frequency_rank }).eq('word_text', wordText)
          if (e2.error) {
            console.error(`Upsert "${wordText}":`, e2.error.message)
            failed++
          } else {
            updated++
            existing.add(wordText)
          }
        } else {
          console.error(`Insert "${wordText}":`, error.message)
          failed++
        }
      } else {
        inserted++
        existing.add(wordText)
      }
    }
    if ((updated + inserted + failed) % 200 === 0) {
      console.log(`… ${updated + inserted + failed} / ${entries.length}`)
    }
  }

  console.log(`Done. updated=${updated} inserted=${inserted} failed=${failed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
