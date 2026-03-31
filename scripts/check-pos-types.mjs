import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const { data, error } = await supabase.from('pos_types').select('*').order('id')
if (error) {
  console.error('Error:', error)
  process.exit(1)
}
console.log('pos_types rows:', JSON.stringify(data, null, 2))
console.log('Count:', data?.length ?? 0)
