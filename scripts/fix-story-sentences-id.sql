-- Run in Supabase Dashboard > SQL Editor
-- Add auto-increment default to id column
CREATE SEQUENCE IF NOT EXISTS story_sentences_id_seq OWNED BY story_sentences.id;
SELECT setval('story_sentences_id_seq'::regclass, (COALESCE((SELECT max(id) FROM story_sentences), 0) + 1)::bigint);
ALTER TABLE story_sentences ALTER COLUMN id SET DEFAULT nextval('story_sentences_id_seq');
