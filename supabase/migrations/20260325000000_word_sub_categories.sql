-- Sub-categories (themes like family, nature) independent of course level.
-- word_registry PK is word_text; junction references it.

CREATE TABLE IF NOT EXISTS sub_categories (
  id bigserial PRIMARY KEY,
  slug text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sub_categories_slug_key UNIQUE (slug)
);

COMMENT ON TABLE sub_categories IS 'Canonical sub-category tags (e.g. family, nature) for words.';
COMMENT ON COLUMN sub_categories.slug IS 'Stable key, typically lowercase (e.g. family, nature).';

CREATE TABLE IF NOT EXISTS word_registry_sub_categories (
  word_text text NOT NULL REFERENCES word_registry (word_text) ON DELETE CASCADE,
  sub_category_id bigint NOT NULL REFERENCES sub_categories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (word_text, sub_category_id)
);

COMMENT ON TABLE word_registry_sub_categories IS 'Many-to-many: which sub_categories apply to each word_registry row.';

CREATE INDEX IF NOT EXISTS word_registry_sub_categories_sub_category_id_idx
  ON word_registry_sub_categories (sub_category_id);
