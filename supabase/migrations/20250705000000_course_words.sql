-- Course vocabulary: link courses to word_registry rows with a specific POS type.
CREATE TABLE IF NOT EXISTS course_words (
  id bigserial PRIMARY KEY,
  course_id integer NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  word_text text NOT NULL REFERENCES word_registry (word_text) ON DELETE CASCADE,
  pos_type_id integer NOT NULL REFERENCES pos_types (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, word_text, pos_type_id)
);

CREATE INDEX IF NOT EXISTS course_words_course_id_idx ON course_words (course_id);
