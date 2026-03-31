-- Run once in Supabase → SQL Editor if `word_metadata_field_definitions` is missing
-- (fixes: "Could not find the table 'public.word_metadata_field_definitions' in the schema cache").
-- Idempotent: safe to re-run.

ALTER TABLE word_registry ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS word_metadata_field_definitions (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  type text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE word_metadata_field_definitions ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE word_metadata_field_definitions DROP CONSTRAINT IF EXISTS word_metadata_field_definitions_type_check;

UPDATE word_metadata_field_definitions SET type = 'single_select' WHERE type = 'select';

ALTER TABLE word_metadata_field_definitions ADD CONSTRAINT word_metadata_field_definitions_type_check
  CHECK (type IN ('text', 'image', 'link', 'video', 'single_select', 'multi_select'));

-- If PostgREST still errors: Dashboard → Settings → API → reload schema (or wait ~1 min).
