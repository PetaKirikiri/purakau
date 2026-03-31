-- Frequency rank from external lists (e.g. top N Māori lemmas); nullable for untagged words.
ALTER TABLE word_registry ADD COLUMN IF NOT EXISTS frequency_rank integer;

CREATE INDEX IF NOT EXISTS word_registry_frequency_rank_idx ON word_registry (frequency_rank);
