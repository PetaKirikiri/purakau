import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const databaseUrl = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.vuxeemwxdldfjybzgtxc.supabase.co:5432/postgres`

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
