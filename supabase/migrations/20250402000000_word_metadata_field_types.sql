-- Extend word metadata field types; options for select / multi_select (JSON array of strings).
ALTER TABLE word_metadata_field_definitions DROP CONSTRAINT IF EXISTS word_metadata_field_definitions_type_check;

ALTER TABLE word_metadata_field_definitions
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE word_metadata_field_definitions ADD CONSTRAINT word_metadata_field_definitions_type_check
  CHECK (type IN ('text', 'image', 'link', 'video', 'single_select', 'multi_select'));
