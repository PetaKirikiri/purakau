CREATE TABLE IF NOT EXISTS "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "page_media" ADD COLUMN IF NOT EXISTS "image_id" integer;

ALTER TABLE "page_media" ADD CONSTRAINT "page_media_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE NO ACTION;

-- Migrate existing page_media: create one images row per unique url, then link
INSERT INTO "images" ("url", "tags")
SELECT DISTINCT "url", '[]'::jsonb FROM "page_media" WHERE "url" IS NOT NULL AND "url" != '';

UPDATE "page_media" pm
SET "image_id" = (SELECT i."id" FROM "images" i WHERE i."url" = pm."url" LIMIT 1)
WHERE pm."url" IS NOT NULL AND pm."image_id" IS NULL;

ALTER TABLE "page_media" ALTER COLUMN "url" DROP NOT NULL;
