-- Run in Supabase Dashboard > SQL Editor
-- Add auto-increment default to id column
CREATE SEQUENCE IF NOT EXISTS titles_id_seq OWNED BY titles.id;
SELECT setval('titles_id_seq'::regclass, (COALESCE((SELECT max(id) FROM titles), 0) + 1)::bigint);
ALTER TABLE titles ALTER COLUMN id SET DEFAULT nextval('titles_id_seq');
