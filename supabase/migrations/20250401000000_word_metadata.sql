-- Add metadata column to word_registry for per-word custom field values.
-- Shape: { "picture": "https://...", "myText": "value" }
ALTER TABLE word_registry ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- Global field definitions: which custom fields exist and their types.
CREATE TABLE IF NOT EXISTS word_metadata_field_definitions (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('text', 'image')),
  label text,
  created_at timestamptz DEFAULT now() NOT NULL
);
