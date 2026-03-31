-- Run in Supabase SQL Editor.
-- Creates image_tags table (one row per tag, tokens_array like story_sentences) and migrates from images.tags.

-- image_tags: one row per tag, tokens_array matches story_sentences layout
CREATE TABLE IF NOT EXISTS "image_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "image_id" integer NOT NULL REFERENCES "images"("id") ON DELETE CASCADE,
  "x" numeric NOT NULL DEFAULT 0,
  "y" numeric NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "sentence_text" text,
  "tokens_array" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "image_tags_image_id_idx" ON "image_tags" ("image_id");

-- Migrate existing images.tags to image_tags (skip if images has no tags column)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'images' AND column_name = 'tags') THEN
    INSERT INTO "image_tags" ("image_id", "x", "y", "sort_order", "sentence_text", "tokens_array")
    SELECT
      i."id",
      COALESCE((tag->>'x')::numeric, 0),
      COALESCE((tag->>'y')::numeric, 0),
      ord - 1,
      tag->>'text',
      CASE
        WHEN tag ? 'tokens' AND jsonb_array_length(tag->'tokens') > 0 THEN tag->'tokens'
        WHEN tag ? 'text' AND trim(tag->>'text') != '' THEN (
          SELECT COALESCE(
            jsonb_agg(jsonb_build_object('index', rn, 'text', part, 'pos_type_id', null, 'word_pos_entry_id', null) ORDER BY rn),
            '[]'::jsonb
          )
          FROM (
            SELECT row_number() OVER ()::int AS rn, part
            FROM unnest(regexp_split_to_array(trim(tag->>'text'), E'\\s+')) AS part
            WHERE part != ''
          ) sub
        )
        ELSE '[]'::jsonb
      END
    FROM "images" i,
      jsonb_array_elements(COALESCE(i."tags", '[]'::jsonb)) WITH ORDINALITY AS t(tag, ord)
    WHERE COALESCE(jsonb_array_length(i."tags"), 0) > 0;

    ALTER TABLE "images" DROP COLUMN "tags";
  END IF;
END $$;
