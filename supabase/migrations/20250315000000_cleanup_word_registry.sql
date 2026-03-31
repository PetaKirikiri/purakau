-- Normalize word_text on insert/update: strip punctuation so only one canonical form exists per word.
CREATE OR REPLACE FUNCTION word_registry_normalize_word()
RETURNS TRIGGER AS $$
BEGIN
  NEW.word_text := lower(trim(regexp_replace(NEW.word_text, '[.,;:!?"()\[\]{}–—…\s]+', '', 'g')));
  IF NEW.word_text = '' THEN
    RAISE EXCEPTION 'word_text cannot be empty after normalizing';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS word_registry_normalize_trigger ON word_registry;
CREATE TRIGGER word_registry_normalize_trigger
  BEFORE INSERT OR UPDATE OF word_text ON word_registry
  FOR EACH ROW EXECUTE FUNCTION word_registry_normalize_word();

-- Cleanup function: normalizes word_text (strips punctuation), merges duplicates.
-- Call via: SELECT * FROM cleanup_word_registry();

CREATE OR REPLACE FUNCTION cleanup_word_registry()
RETURNS TABLE(deleted_count bigint, merged_count bigint) AS $$
DECLARE
  del_count bigint;
  mrg_count bigint;
BEGIN
  -- Build merged rows: normalize word_text, merge pos_types, pick first language
  CREATE TEMP TABLE merged_words ON COMMIT DROP AS
  WITH normalized AS (
    SELECT
      lower(trim(regexp_replace(word_text, '[.,;:!?"()\[\]{}–—…\s]+', '', 'g'))) AS norm,
      word_text,
      pos_types,
      language
    FROM word_registry
  ),
  valid AS (
    SELECT * FROM normalized WHERE norm != ''
  ),
  grouped AS (
    SELECT
      norm,
      (array_agg(language))[1] AS language,
      (
        SELECT jsonb_agg(DISTINCT elem)
        FROM valid v2, jsonb_array_elements(v2.pos_types) elem
        WHERE v2.norm = valid.norm
      ) AS pos_types
    FROM valid
    GROUP BY norm
  )
  SELECT norm AS word_text, pos_types, language FROM grouped;

  mrg_count := (SELECT count(*) FROM merged_words);

  -- Delete all current rows
  DELETE FROM word_registry;
  GET DIAGNOSTICS del_count = ROW_COUNT;

  -- Insert merged rows
  INSERT INTO word_registry (word_text, pos_types, language)
  SELECT word_text, pos_types, language FROM merged_words;

  deleted_count := del_count;
  merged_count := mrg_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
