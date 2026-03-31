#!/usr/bin/env node
/**
 * Runs the courses migration (adds title_id, course_id) against Supabase.
 * Usage: npm run db:migrate-courses
 * Requires: SUPABASE_DB_PASSWORD in .env
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const password = process.env.SUPABASE_DB_PASSWORD
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const databaseUrl = process.env.DATABASE_URL
const poolerRegion = process.env.SUPABASE_DB_POOLER_REGION

const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
const projectRef = match ? match[1] : 'vuxeemwxdldfjybzgtxc'

function buildConnectionStrings() {
  const urls = []
  if (databaseUrl) urls.push(databaseUrl)
  const regions = poolerRegion ? [poolerRegion] : ['us-east-1', 'ap-southeast-1', 'eu-west-1', 'ca-central-1', 'ap-northeast-1']
  for (const region of regions) {
    if (password) {
      urls.push(`postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:5432/postgres`)
      urls.push(`postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`)
    }
  }
  if (password) {
    urls.push(`postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`)
  }
  return urls
}

const connectionStrings = buildConnectionStrings()
if (connectionStrings.length === 0) {
  console.error('Error: Set SUPABASE_DB_PASSWORD in .env, or DATABASE_URL.')
  process.exit(1)
}

const sqlPath = join(__dirname, 'run-courses-migration.sql')
const sql = readFileSync(sqlPath, 'utf8')

async function runWith(url) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query(sql)
  await client.end()
}

async function run() {
  let lastErr
  for (let i = 0; i < connectionStrings.length; i++) {
    const url = connectionStrings[i]
    const label = i === 0 && databaseUrl ? 'DATABASE_URL' : url.includes('pooler') ? 'Pooler' : 'Direct'
    try {
      console.log(`Trying ${label}...`)
      await runWith(url)
      console.log('Courses migration completed.')
      return
    } catch (err) {
      lastErr = err
      console.log(`  ${label} failed:`, err.message)
    }
  }
  console.error('Migration failed:', lastErr?.message)
  process.exit(1)
}

run()
