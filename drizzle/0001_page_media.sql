CREATE TABLE IF NOT EXISTS "page_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"title_id" integer NOT NULL,
	"page_number" integer NOT NULL,
	"url" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "page_media" ADD CONSTRAINT "page_media_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE NO ACTION;
