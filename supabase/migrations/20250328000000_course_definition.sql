-- Course definition: version_id pins course to story version; sentence_patterns get title_id when created from story.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "version_id" integer REFERENCES "public"."story_versions"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "courses_version_id_idx" ON "courses" ("version_id");

ALTER TABLE "sentence_patterns" ADD COLUMN IF NOT EXISTS "title_id" integer REFERENCES "public"."titles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "sentence_patterns_title_id_idx" ON "sentence_patterns" ("title_id");
