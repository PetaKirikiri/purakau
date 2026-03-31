-- Story versioning: story_versions table and version_id on all versioned tables.
-- Enables multiple versions per title (1.0, 1.1, 1.2) with independent content.

-- 1. Create story_versions
CREATE TABLE IF NOT EXISTS "story_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "title_id" integer NOT NULL REFERENCES "public"."titles"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "label" text NOT NULL,
  "based_on_version_id" integer REFERENCES "public"."story_versions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_versions_title_version_idx"
  ON "story_versions" ("title_id", "version_number");

-- 2. Backfill: create version 1.0 for each title
INSERT INTO "story_versions" ("title_id", "version_number", "label")
SELECT t."id", 10, '1.0'
FROM "titles" t
WHERE NOT EXISTS (
  SELECT 1 FROM "story_versions" sv WHERE sv."title_id" = t."id"
);

-- 3. Add version_id to story_sources
-- If story_sources has no id (PK is title_id), add id and change PK for versioning
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'story_sources' AND column_name = 'id') THEN
    ALTER TABLE story_sentences DROP CONSTRAINT IF EXISTS story_sentences_title_id_fkey;
    ALTER TABLE story_sources ADD COLUMN id serial;
    ALTER TABLE story_sources DROP CONSTRAINT story_sources_pkey;
    ALTER TABLE story_sources ADD PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE "story_sources" ADD COLUMN IF NOT EXISTS "version_id" integer;

UPDATE "story_sources" ss
SET "version_id" = (
  SELECT sv."id" FROM "story_versions" sv
  WHERE sv."title_id" = ss."title_id" AND sv."version_number" = 10
  LIMIT 1
)
WHERE ss."version_id" IS NULL;

-- Drop old unique (name varies by migration tool)
ALTER TABLE "story_sources" DROP CONSTRAINT IF EXISTS "story_sources_title_id_language_unique";
ALTER TABLE "story_sources" DROP CONSTRAINT IF EXISTS "story_sources_title_id_language_key";
CREATE UNIQUE INDEX IF NOT EXISTS "story_sources_title_lang_version_idx"
  ON "story_sources" ("title_id", "language", "version_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_sources_version_id_fk') THEN
    ALTER TABLE "story_sources" ADD CONSTRAINT "story_sources_version_id_fk"
      FOREIGN KEY ("version_id") REFERENCES "public"."story_versions"("id") ON DELETE CASCADE;
  END IF; END $$;

-- 4. Add version_id to story_sentences
ALTER TABLE "story_sentences" ADD COLUMN IF NOT EXISTS "version_id" integer;

-- Backfill via title_id (story_sentences links to titles directly)
UPDATE "story_sentences" ss
SET "version_id" = (
  SELECT sv."id" FROM "story_versions" sv
  WHERE sv."title_id" = ss."title_id" AND sv."version_number" = 10
  LIMIT 1
)
WHERE ss."version_id" IS NULL
  AND ss."title_id" IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_sentences_version_id_fk') THEN
    ALTER TABLE "story_sentences" ADD CONSTRAINT "story_sentences_version_id_fk"
      FOREIGN KEY ("version_id") REFERENCES "public"."story_versions"("id") ON DELETE CASCADE;
  END IF; END $$;

-- 5. Add version_id to page_media
ALTER TABLE "page_media" ADD COLUMN IF NOT EXISTS "version_id" integer;

UPDATE "page_media" pm
SET "version_id" = (
  SELECT sv."id" FROM "story_versions" sv
  WHERE sv."title_id" = pm."title_id" AND sv."version_number" = 10
  LIMIT 1
)
WHERE pm."version_id" IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_media_version_id_fk') THEN
    ALTER TABLE "page_media" ADD CONSTRAINT "page_media_version_id_fk"
      FOREIGN KEY ("version_id") REFERENCES "public"."story_versions"("id") ON DELETE CASCADE;
  END IF; END $$;

-- 6. Add version_id to image_tags
ALTER TABLE "image_tags" ADD COLUMN IF NOT EXISTS "version_id" integer;

-- Backfill: for each image_tag, find version via page_media that uses this image
UPDATE "image_tags" it
SET "version_id" = (
  SELECT pm."version_id" FROM "page_media" pm
  WHERE pm."image_id" = it."image_id" AND pm."version_id" IS NOT NULL
  LIMIT 1
)
WHERE it."version_id" IS NULL;

-- Fallback: use images.usages title_id to get version
UPDATE "image_tags" it
SET "version_id" = (
  SELECT sv."id" FROM "story_versions" sv
  WHERE sv."title_id" = (
    SELECT (u->>'title_id')::int FROM jsonb_array_elements(
      COALESCE((SELECT i."usages" FROM "images" i WHERE i."id" = it."image_id"), '[]'::jsonb)
    ) u LIMIT 1
  ) AND sv."version_number" = 10
  LIMIT 1
)
WHERE it."version_id" IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_tags_version_id_fk') THEN
    ALTER TABLE "image_tags" ADD CONSTRAINT "image_tags_version_id_fk"
      FOREIGN KEY ("version_id") REFERENCES "public"."story_versions"("id") ON DELETE CASCADE;
  END IF; END $$;

-- 7. Update images.usages to use version_id
-- New format: [{version_id, page_number}]
-- We migrate: for each usage with title_id, find version 1.0 for that title
UPDATE "images" i
SET "usages" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'version_id', sv."id",
        'page_number', (u->>'page_number')::int
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(i."usages", '[]'::jsonb)) u
  LEFT JOIN "story_versions" sv ON sv."title_id" = (u->>'title_id')::int AND sv."version_number" = 10
)
WHERE jsonb_array_length(COALESCE(i."usages", '[]'::jsonb)) > 0
  AND (i."usages"->0 ? 'title_id');

-- 8. RPC: create new version by copying from existing
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

  -- Copy story_sources
  INSERT INTO story_sources (title_id, source_text, language, version_id)
  SELECT title_id, source_text, language, v_new.id
  FROM story_sources WHERE version_id = p_based_on_version_id
  RETURNING id INTO v_new_source_id;

  -- Copy story_sentences (via story_source_id or title_id)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_sentences' AND column_name = 'story_source_id') THEN
    INSERT INTO story_sentences (story_source_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, version_id)
    SELECT v_new_source_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, v_new.id
    FROM story_sentences WHERE version_id = p_based_on_version_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_sentences' AND column_name = 'title_id') THEN
    INSERT INTO story_sentences (title_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, version_id)
    SELECT p_title_id, chapter_number, page_number, paragraph_number, sentence_number, sentence_text, tokens_array, v_new.id
    FROM story_sentences WHERE version_id = p_based_on_version_id;
  END IF;

  -- Copy page_media
  INSERT INTO page_media (title_id, page_number, image_id, url, media_type, sort_order, version_id)
  SELECT title_id, page_number, image_id, url, media_type, sort_order, v_new.id
  FROM page_media WHERE version_id = p_based_on_version_id;

  -- Copy image_tags for each image used in the new page_media
  FOR v_pm IN SELECT image_id FROM page_media WHERE version_id = v_new.id AND image_id IS NOT NULL
  LOOP
    INSERT INTO image_tags (image_id, x, y, sort_order, sentence_text, tokens_array, version_id)
    SELECT image_id, x, y, sort_order, sentence_text, tokens_array, v_new.id
    FROM image_tags WHERE image_id = v_pm.image_id AND version_id = p_based_on_version_id;
  END LOOP;

  -- Update images.usages: add new version's (version_id, page_number) for each image
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

-- 9. RPC: Ensure a title has version 1.0 and backfill version_id on all related rows
CREATE OR REPLACE FUNCTION ensure_story_version_for_title(p_title_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id integer;
  v_label text := '1.0';
  v_backfilled boolean := false;
BEGIN
  INSERT INTO story_versions (title_id, version_number, label)
  SELECT p_title_id, 10, '1.0'
  WHERE NOT EXISTS (SELECT 1 FROM story_versions WHERE title_id = p_title_id)
  RETURNING id, label INTO v_version_id, v_label;

  IF v_version_id IS NULL THEN
    SELECT id, label INTO v_version_id, v_label
    FROM story_versions WHERE title_id = p_title_id AND version_number = 10 LIMIT 1;
  END IF;

  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'Could not create or find version for title %', p_title_id;
  END IF;

  UPDATE story_sources SET version_id = v_version_id
  WHERE title_id = p_title_id AND version_id IS NULL;
  IF FOUND THEN v_backfilled := true; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'story_sentences' AND column_name = 'title_id') THEN
    UPDATE story_sentences SET version_id = v_version_id
    WHERE title_id = p_title_id AND version_id IS NULL;
    IF FOUND THEN v_backfilled := true; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'story_sentences' AND column_name = 'story_source_id') THEN
    UPDATE story_sentences ss SET version_id = v_version_id
    FROM story_sources sv
    WHERE ss.story_source_id = sv.id AND sv.title_id = p_title_id AND ss.version_id IS NULL;
    IF FOUND THEN v_backfilled := true; END IF;
  END IF;

  UPDATE page_media SET version_id = v_version_id
  WHERE title_id = p_title_id AND version_id IS NULL;
  IF FOUND THEN v_backfilled := true; END IF;

  UPDATE image_tags it SET version_id = pm.version_id
  FROM page_media pm
  WHERE pm.image_id = it.image_id AND pm.version_id IS NOT NULL AND it.version_id IS NULL;
  IF FOUND THEN v_backfilled := true; END IF;

  RETURN jsonb_build_object('version_id', v_version_id, 'label', v_label, 'backfilled', v_backfilled);
END;
$$;
