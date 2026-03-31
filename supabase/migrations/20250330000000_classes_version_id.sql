-- Level = story version. version_id dictates which story content the class uses.
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "version_id" integer REFERENCES "public"."story_versions"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "classes_version_id_idx" ON "classes" ("version_id");
