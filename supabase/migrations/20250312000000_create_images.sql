-- Run this in Supabase SQL Editor if drizzle-kit migrate fails.
-- Creates images table and migrates page_media to use image_id.

CREATE TABLE IF NOT EXISTS "images" (
  "id" serial PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "page_media" ADD COLUMN IF NOT EXISTS "image_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_media_image_id_images_id_fk'
  ) THEN
    ALTER TABLE "page_media" ADD CONSTRAINT "page_media_image_id_images_id_fk"
      FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE NO ACTION;
  END IF;
END $$;

INSERT INTO "images" ("url", "tags")
SELECT DISTINCT pm."url", '[]'::jsonb
FROM "page_media" pm
WHERE pm."url" IS NOT NULL AND pm."url" != ''
  AND NOT EXISTS (SELECT 1 FROM "images" i WHERE i."url" = pm."url");

UPDATE "page_media" pm
SET "image_id" = (SELECT i."id" FROM "images" i WHERE i."url" = pm."url" LIMIT 1)
WHERE pm."url" IS NOT NULL AND pm."image_id" IS NULL;

ALTER TABLE "page_media" ALTER COLUMN "url" DROP NOT NULL;

-- Add usages to images
ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "usages" jsonb DEFAULT '[]'::jsonb;

UPDATE "images" i
SET "usages" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('title_id', pm."title_id", 'page_number', pm."page_number"))
   FROM "page_media" pm WHERE pm."image_id" = i."id"),
  '[]'::jsonb
);
