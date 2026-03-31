import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = 'https://vuxeemwxdldfjybzgtxc.supabase.co'
const keys = [
  { name: 'VITE_SUPABASE_ANON_KEY', value: process.env.VITE_SUPABASE_ANON_KEY },
  { name: 'PUBLISHABLE_KEY', value: process.env.PUBLISHABLE_KEY },
]

for (const { name, value } of keys) {
  if (!value) {
    console.log(`${name}: (not set) - skip`)
    continue
  }
  try {
    const supabase = createClient(url, value)
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.log(`${name}: ${error.message}`)
    } else {
      console.log(`${name}: OK - got response`)
    }
  } catch (e) {
    console.log(`${name}: ${e.message}`)
  }
}
