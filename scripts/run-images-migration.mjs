#!/usr/bin/env node
/**
 * Runs the images table migration against Supabase.
 * Usage: node scripts/run-images-migration.mjs
 *
 * Connection (tried in order):
 * 1. DATABASE_URL - paste full connection string from Supabase Dashboard > Settings > Database
 * 2. Pooler (Session mode) - try common regions if SUPABASE_DB_POOLER_REGION is set
 * 3. Direct - db.PROJECT.supabase.co
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
  console.error('Error: Set SUPABASE_DB_PASSWORD in .env, or DATABASE_URL with full connection string.')
  console.error('  Get it from: Supabase Dashboard > Project Settings > Database > Connection string')
  process.exit(1)
}

const sqlPath = join(__dirname, 'run-images-migration.sql')
const sql = readFileSync(sqlPath, 'utf8')

async function runWith(url, label) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query(sql)
  await client.end()
  return label
}

async function run() {
  let lastErr
  for (let i = 0; i < connectionStrings.length; i++) {
    const url = connectionStrings[i]
    const label = i === 0 && databaseUrl ? 'DATABASE_URL' : url.includes('pooler') ? 'Pooler' : 'Direct'
    try {
      console.log(`Trying ${label}...`)
      await runWith(url, label)
      console.log('Migration completed successfully.')
      return
    } catch (err) {
      lastErr = err
      if (err.code === 'ENOTFOUND') {
        console.log(`  ${label} failed: host not found`)
      } else {
        console.log(`  ${label} failed:`, err.message)
      }
    }
  }
  console.error('\nMigration failed:', lastErr?.message)
  console.error('\nRun the SQL manually:')
  console.error('  1. Open https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
  console.error('  2. Paste the contents of scripts/run-images-migration.sql')
  console.error('  3. Click Run')
  try {
    const { execSync } = await import('child_process')
    execSync(`cat "${sqlPath}" | pbcopy`, { stdio: 'pipe' })
    console.error('\n  (SQL copied to clipboard - paste in the SQL Editor)')
  } catch {
    console.error('\n  Or add DATABASE_URL to .env from Supabase Dashboard > Settings > Database')
  }
  process.exit(1)
}

run()
