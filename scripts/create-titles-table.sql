-- Run this in Supabase Dashboard > SQL Editor
CREATE TABLE IF NOT EXISTS "titles" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "author" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
