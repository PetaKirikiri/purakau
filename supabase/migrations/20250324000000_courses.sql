-- Courses: predefined levels (e.g. Level 1, Level 2) for classes to pick from.

CREATE TABLE IF NOT EXISTS "courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "course_id" integer REFERENCES "public"."courses"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "classes_course_id_idx" ON "classes" ("course_id");
