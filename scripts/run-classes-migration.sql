-- Run this in Supabase SQL Editor to create classes and students tables.
-- Creates: clients, classes, class_sessions, students, class_enrollments.

-- 1. clients
CREATE TABLE IF NOT EXISTS "clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. classes (client-run courses)
CREATE TABLE IF NOT EXISTS "classes" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "public"."clients"("id") ON DELETE CASCADE,
  "level" text,
  "label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "classes_client_id_idx" ON "classes" ("client_id");

-- 3. class_sessions (10 per class, weekly)
CREATE TABLE IF NOT EXISTS "class_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "class_id" integer NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
  "session_number" integer NOT NULL,
  "session_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "class_sessions_class_session_idx"
  ON "class_sessions" ("class_id", "session_number");
CREATE INDEX IF NOT EXISTS "class_sessions_class_id_idx" ON "class_sessions" ("class_id");

-- 4. students
CREATE TABLE IF NOT EXISTS "students" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. class_enrollments (many-to-many students <-> classes)
CREATE TABLE IF NOT EXISTS "class_enrollments" (
  "id" serial PRIMARY KEY NOT NULL,
  "student_id" integer NOT NULL REFERENCES "public"."students"("id") ON DELETE CASCADE,
  "class_id" integer NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "class_enrollments_student_class_idx"
  ON "class_enrollments" ("student_id", "class_id");
CREATE INDEX IF NOT EXISTS "class_enrollments_student_id_idx" ON "class_enrollments" ("student_id");
CREATE INDEX IF NOT EXISTS "class_enrollments_class_id_idx" ON "class_enrollments" ("class_id");
