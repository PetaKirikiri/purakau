-- Questions attached to page pictures (page_media rows); tokenized like story sentences.

CREATE TABLE IF NOT EXISTS "page_media_questions" (
  "id" serial PRIMARY KEY NOT NULL,
  "page_media_id" integer NOT NULL REFERENCES "public"."page_media"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "tokens_array" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "page_media_questions_page_media_sort_unique" UNIQUE ("page_media_id", "sort_order")
);

CREATE INDEX IF NOT EXISTS "page_media_questions_page_media_id_idx"
  ON "page_media_questions" ("page_media_id");

-- Extend create_story_version to copy questions mapped to new page_media rows.
CREATE OR REPLACE FUNCTION create_story_version(
  p_title_id integer,
  p_based_on_version_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_based story_versions%ROWTYPE;
  v_new story_versions%ROWTYPE;
  v_next_num integer;
  v_next_label text;
  v_new_source_id integer;
  v_sent record;
  v_pm record;
  v_tag record;
  v_old_usages jsonb;
  v_new_usages jsonb;
  v_img_id integer;
BEGIN
  SELECT * INTO v_based FROM story_versions WHERE id = p_based_on_version_id AND title_id = p_title_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base version not found';
  END IF;

  v_next_num := (SELECT COALESCE(MAX(version_number), 10) FROM story_versions WHERE title_id = p_title_id) + 1;
  v_next_label := (v_next_num / 10)::text || '.' || (v_next_num % 10)::text;

  INSERT INTO story_versions (title_id, version_number, label, based_on_version_id)
  VALUES (p_title_id, v_next_num, v_next_label, p_based_on_version_id)
  RETURNING * INTO v_new;

  INSERT INTO story_sources (title_id, source_text, language, version_id)
  SELECT title_id, source_text, language, v_new.id
  FROM story_sources WHERE version_id = p_based_on_version_id
  RETURNING id INTO v_new_source_id;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_sentences' AND column_name = 'story_source_id') THEN
    INSERT INTO story_sentences (story_source_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, version_id)
    SELECT v_new_source_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, v_new.id
    FROM story_sentences WHERE version_id = p_based_on_version_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_sentences' AND column_name = 'title_id') THEN
    INSERT INTO story_sentences (title_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, version_id)
    SELECT p_title_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, v_new.id
    FROM story_sentences WHERE version_id = p_based_on_version_id;
  END IF;

  INSERT INTO page_media (title_id, page_number, image_id, url, media_type, sort_order, version_id)
  SELECT title_id, page_number, image_id, url, media_type, sort_order, v_new.id
  FROM page_media WHERE version_id = p_based_on_version_id;

  INSERT INTO page_media_questions (page_media_id, sort_order, tokens_array)
  SELECT pm_new.id, q.sort_order, q.tokens_array
  FROM page_media_questions q
  INNER JOIN page_media pm_old ON pm_old.id = q.page_media_id AND pm_old.version_id = p_based_on_version_id
  INNER JOIN page_media pm_new
    ON pm_new.version_id = v_new.id
    AND pm_new.title_id = pm_old.title_id
    AND pm_new.page_number = pm_old.page_number
    AND pm_new.sort_order = pm_old.sort_order
    AND COALESCE(pm_new.image_id, -1) = COALESCE(pm_old.image_id, -1);

  FOR v_pm IN SELECT image_id FROM page_media WHERE version_id = v_new.id AND image_id IS NOT NULL
  LOOP
    INSERT INTO image_tags (image_id, x, y, sort_order, sentence_text, tokens_array, version_id)
    SELECT image_id, x, y, sort_order, sentence_text, tokens_array, v_new.id
    FROM image_tags WHERE image_id = v_pm.image_id AND version_id = p_based_on_version_id;
  END LOOP;

  FOR v_pm IN SELECT image_id, page_number FROM page_media WHERE version_id = v_new.id AND image_id IS NOT NULL
  LOOP
    SELECT usages INTO v_old_usages FROM images WHERE id = v_pm.image_id;
    v_old_usages := COALESCE(v_old_usages, '[]'::jsonb);
    v_new_usages := v_old_usages || jsonb_build_array(jsonb_build_object('version_id', v_new.id, 'page_number', v_pm.page_number));
    UPDATE images SET usages = v_new_usages WHERE id = v_pm.image_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_new.id, 'version_number', v_new.version_number, 'label', v_new.label);
END;
$$;
