-- Link courses to stories (titles). Each course has one story that dictates its content.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "title_id" integer REFERENCES "public"."titles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "courses_title_id_idx" ON "courses" ("title_id");
