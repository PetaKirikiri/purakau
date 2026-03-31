import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://vuxeemwxdldfjybzgtxc.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. For Vercel: Project → Settings → Environment Variables, add VITE_SUPABASE_ANON_KEY (your Supabase anon/public key from Project Settings → API), then redeploy so the build picks it up.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
