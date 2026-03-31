-- Run this in Supabase Dashboard > SQL Editor
CREATE TABLE IF NOT EXISTS "word_registry" (
  "word_text" text PRIMARY KEY,
  "pos_types" jsonb NOT NULL DEFAULT '[]',
  "language" text NOT NULL DEFAULT 'mi',
  "created_at" timestamptz DEFAULT now() NOT NULL
);
