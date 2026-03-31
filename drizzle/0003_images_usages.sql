ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "usages" jsonb DEFAULT '[]'::jsonb;

UPDATE "images" i
SET "usages" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('title_id', pm."title_id", 'page_number', pm."page_number"))
   FROM "page_media" pm WHERE pm."image_id" = i."id"),
  '[]'::jsonb
);
