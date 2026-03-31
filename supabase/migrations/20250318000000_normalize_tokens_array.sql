-- Normalize tokens_array: split tokens that have leading/trailing punctuation into separate tokens.
-- Word tokens keep pos_type_id; punctuation tokens get null.
-- Ensures no word token in the DB has special characters attached.

CREATE OR REPLACE FUNCTION normalize_tokens_array(arr jsonb) RETURNS jsonb AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  tok jsonb;
  txt text;
  lead text;
  trail text;
  word text;
  idx int := 1;
  pos_val jsonb;
  wpe_val jsonb;
  punct_re text := '[.,;:!?''"()[\]{}–—…\s]+';
BEGIN
  IF arr IS NULL OR jsonb_array_length(arr) = 0 THEN
    RETURN arr;
  END IF;

  FOR tok IN SELECT * FROM jsonb_array_elements(arr)
  LOOP
    txt := coalesce(tok->>'text', '');
    pos_val := tok->'pos_type_id';
    wpe_val := tok->'word_pos_entry_id';

    lead := (regexp_matches(txt, '^' || punct_re || '+'))[1];
    lead := coalesce(lead, '');
    trail := (regexp_matches(txt, punct_re || '+$'))[1];
    trail := coalesce(trail, '');
    word := regexp_replace(txt, '^' || punct_re || '+', '');
    word := regexp_replace(word, punct_re || '+$', '');

    IF lead != '' THEN
      result := result || jsonb_build_object('index', idx, 'text', lead, 'pos_type_id', null, 'word_pos_entry_id', null);
      idx := idx + 1;
    END IF;
    IF word != '' THEN
      result := result || jsonb_build_object('index', idx, 'text', word, 'pos_type_id', pos_val, 'word_pos_entry_id', wpe_val);
      idx := idx + 1;
    END IF;
    IF trail != '' THEN
      result := result || jsonb_build_object('index', idx, 'text', trail, 'pos_type_id', null, 'word_pos_entry_id', null);
      idx := idx + 1;
    END IF;
    IF lead = '' AND word = '' AND trail = '' THEN
      result := result || jsonb_build_object('index', idx, 'text', txt, 'pos_type_id', pos_val, 'word_pos_entry_id', wpe_val);
      idx := idx + 1;
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

UPDATE story_sentences
SET tokens_array = normalize_tokens_array(tokens_array)
WHERE tokens_array IS NOT NULL AND jsonb_array_length(tokens_array) > 0;

UPDATE image_tags
SET tokens_array = normalize_tokens_array(tokens_array)
WHERE tokens_array IS NOT NULL AND jsonb_array_length(tokens_array) > 0;

DROP FUNCTION normalize_tokens_array(jsonb);
