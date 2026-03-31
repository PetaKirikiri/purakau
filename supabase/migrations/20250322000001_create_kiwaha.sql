-- Kīwaha: stable units of language (idioms, fixed expressions).
-- Users shift+click multiple tokens to connect them as a kīwaha.

CREATE TABLE IF NOT EXISTS "kiwaha" (
  "id" serial PRIMARY KEY NOT NULL,
  "phrase_text" text NOT NULL,
  "meaning" text,
  "version_id" integer REFERENCES "story_versions"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kiwaha_instances" (
  "id" serial PRIMARY KEY NOT NULL,
  "kiwaha_id" integer NOT NULL REFERENCES "kiwaha"("id") ON DELETE CASCADE,
  "sentence_id" integer NOT NULL REFERENCES "story_sentences"("id") ON DELETE CASCADE,
  "token_start" integer NOT NULL,
  "token_end" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "kiwaha_version_id_idx" ON "kiwaha" ("version_id");
CREATE INDEX IF NOT EXISTS "kiwaha_instances_kiwaha_id_idx" ON "kiwaha_instances" ("kiwaha_id");
CREATE INDEX IF NOT EXISTS "kiwaha_instances_sentence_id_idx" ON "kiwaha_instances" ("sentence_id");
