import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.vuxeemwxdldfjybzgtxc.supabase.co:5432/postgres`
const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
