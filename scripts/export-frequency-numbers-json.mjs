#!/usr/bin/env node
/**
 * Read Apple Numbers frequency.numbers (Python + numbers-parser) and write public/frequency-numbers.json
 * for the Frequency page. Browsers cannot parse .numbers natively.
 *
 * Usage:
 *   npm run export:freq:json
 *   node scripts/export-frequency-numbers-json.mjs [path/to/frequency.numbers]
 *
 * Default path: docs/frequency.numbers, then ./frequency.numbers
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

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

function resolveInputPath() {
  const arg = process.argv[2]
  if (arg) {
    const abs = path.isAbsolute(arg) ? arg : path.resolve(repoRoot, arg)
    if (!fs.existsSync(abs)) {
      console.error('File not found:', abs)
      process.exit(1)
    }
    return abs
  }
  const candidates = [
    path.join(repoRoot, 'docs', 'frequency.numbers'),
    path.join(repoRoot, 'frequency.numbers'),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    console.error(
      'No frequency.numbers found. Place it at docs/frequency.numbers or repo root, or pass the path:\n' +
        '  node scripts/export-frequency-numbers-json.mjs path/to/frequency.numbers'
    )
    process.exit(1)
  }
  return found
}

const inputPath = resolveInputPath()
const pairs = loadPairsFromNumbers(inputPath)
pairs.sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word))
const outPath = path.join(repoRoot, 'public', 'frequency-numbers.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(pairs, null, 2), 'utf8')
console.log(`Wrote ${pairs.length} entries → ${path.relative(repoRoot, outPath)} (from ${path.relative(repoRoot, inputPath)})`)
