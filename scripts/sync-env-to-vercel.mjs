#!/usr/bin/env node
/**
 * Push Vite-facing env vars from .env to Vercel (production).
 * Add the same keys for Preview in the dashboard if you use preview deployments.
 * Requires: `npx vercel link` and CLI login. Does not print secret values.
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEYS = ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_OPENAI_API_KEY']
const TARGETS = ['production']

function addEnv(name, target, value) {
  const args = [
    '--yes',
    'vercel@latest',
    'env',
    'add',
    name,
    target,
    '--value',
    value,
    '--yes',
    '--sensitive',
  ]
  let r = spawnSync('npx', args, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (r.status !== 0) {
    r = spawnSync('npx', [...args, '--force'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `exit ${r.status}`)
    process.exit(1)
  }
}

for (const key of KEYS) {
  const value = process.env[key]?.trim()
  if (!value) {
    console.log(`skip ${key} (not set in .env)`)
    continue
  }
  for (const target of TARGETS) {
    console.log(`→ ${key} (${target})`)
    addEnv(key, target, value)
  }
}
console.log('Done. Trigger a redeploy (empty commit or Vercel dashboard) if the latest build ran without these.')
