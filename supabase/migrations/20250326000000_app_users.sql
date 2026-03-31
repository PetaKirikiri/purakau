-- App users: email, display name, role. auth_user_id links to Supabase Auth when user signs up.
CREATE TABLE IF NOT EXISTS "app_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "display_name" text,
  "role" text NOT NULL DEFAULT 'user',
  "auth_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "app_users_email_idx" ON "app_users" ("email");
CREATE INDEX IF NOT EXISTS "app_users_auth_user_id_idx" ON "app_users" ("auth_user_id");

-- Allow read/write for all (anon + authenticated) during setup. Restrict with RLS later.
ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_users_select" ON "app_users" FOR SELECT USING (true);
CREATE POLICY "app_users_insert" ON "app_users" FOR INSERT WITH CHECK (true);
CREATE POLICY "app_users_update" ON "app_users" FOR UPDATE USING (true);
CREATE POLICY "app_users_delete" ON "app_users" FOR DELETE USING (true);
