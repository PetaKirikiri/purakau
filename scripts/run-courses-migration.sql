-- Run this in Supabase SQL Editor to create courses table and add course_id to classes.

CREATE TABLE IF NOT EXISTS "courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add title_id if missing (for tables created before this column existed)
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "title_id" integer REFERENCES "public"."titles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "courses_title_id_idx" ON "courses" ("title_id");

-- Add version_id to pin course to specific story version
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "version_id" integer REFERENCES "public"."story_versions"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "courses_version_id_idx" ON "courses" ("version_id");

-- Add title_id to sentence_patterns (when created from a story)
ALTER TABLE "sentence_patterns" ADD COLUMN IF NOT EXISTS "title_id" integer REFERENCES "public"."titles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "sentence_patterns_title_id_idx" ON "sentence_patterns" ("title_id");

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "course_id" integer REFERENCES "public"."courses"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "classes_course_id_idx" ON "classes" ("course_id");
