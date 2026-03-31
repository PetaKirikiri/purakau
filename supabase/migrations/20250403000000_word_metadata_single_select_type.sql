-- Rename select → single_select for clarity (singular vs multi_select).
ALTER TABLE word_metadata_field_definitions DROP CONSTRAINT IF EXISTS word_metadata_field_definitions_type_check;

UPDATE word_metadata_field_definitions SET type = 'single_select' WHERE type = 'select';

ALTER TABLE word_metadata_field_definitions ADD CONSTRAINT word_metadata_field_definitions_type_check
  CHECK (type IN ('text', 'image', 'link', 'video', 'single_select', 'multi_select'));
