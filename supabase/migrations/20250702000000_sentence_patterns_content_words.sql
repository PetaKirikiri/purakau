-- Example lexical items per blueprint slot (same order as pos_blueprint), for admin UI labels.
ALTER TABLE "sentence_patterns" ADD COLUMN IF NOT EXISTS "content_words" jsonb NOT NULL DEFAULT '[]'::jsonb;
