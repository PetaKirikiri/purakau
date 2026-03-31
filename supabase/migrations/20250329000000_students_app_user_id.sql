-- Link students to app_users. Students can be created from users when enrolling in a class.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "app_user_id" integer REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "students_app_user_id_key" ON "students" ("app_user_id") WHERE app_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "students_app_user_id_idx" ON "students" ("app_user_id");
