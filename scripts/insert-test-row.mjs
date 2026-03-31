import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.PUBLISHABLE_KEY
const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('titles')
  .insert({ name: 'Test story' })
  .select()
  .single()

if (error) {
  console.error('Error:', error.message)
  if (error.code === '23502') {
    console.error('Fix: Run scripts/fix-titles-id.sql in Supabase SQL Editor')
  }
  process.exit(1)
}
console.log('Inserted:', data)
