-- Sentence patterns: two-level blueprints for sentence structure.
-- Level 1: pos_blueprint (POS type sequence)
-- Level 2: phrase_components (phrase patterns that matched)

CREATE TABLE IF NOT EXISTS "sentence_patterns" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "pos_blueprint" jsonb NOT NULL,
  "phrase_components" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sentence_patterns_name_idx" ON "sentence_patterns" ("name");
