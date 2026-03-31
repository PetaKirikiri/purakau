-- Document pos_types structure in word_registry.
-- Each entry: { pos_type_id: int, code: text, auto?: boolean }
-- When auto=true: untagged tokens matching this word in a story get this pos_type_id applied automatically.
-- Used for words that are 100% of the time a given POS (e.g. articles, determiners).
COMMENT ON COLUMN word_registry.pos_types IS 'JSONB array of { pos_type_id, code, auto? }. auto=true means apply this POS to untagged instances of the word in the version.';
