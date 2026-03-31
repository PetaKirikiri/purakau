import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const { Pool } = pg
const connectionString = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.vuxeemwxdldfjybzgtxc.supabase.co:5432/postgres`

try {
  const pool = new Pool({ connectionString })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "titles" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "author" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  await pool.end()
  console.log('Table created')
} catch (e) {
  console.error('Create table failed:', e.message)
  process.exit(1)
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const { data, error } = await supabase
  .from('titles')
  .insert({ name: 'Test story' })
  .select()
  .single()

if (error) {
  console.error('Insert failed:', error.message)
  process.exit(1)
}
console.log('Inserted:', data)
