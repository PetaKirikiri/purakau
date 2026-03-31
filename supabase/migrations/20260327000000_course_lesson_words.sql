-- Schedule course vocabulary across 10 lessons (weeks). Each row ties a course_words entry to lesson_number 1..10.
CREATE TABLE IF NOT EXISTS course_lesson_words (
  id bigserial PRIMARY KEY,
  course_id integer NOT NULL,
  word_text text NOT NULL,
  pos_type_id integer NOT NULL,
  lesson_number smallint NOT NULL CHECK (lesson_number >= 1 AND lesson_number <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, word_text, pos_type_id),
  FOREIGN KEY (course_id, word_text, pos_type_id)
    REFERENCES course_words (course_id, word_text, pos_type_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS course_lesson_words_course_lesson_idx
  ON course_lesson_words (course_id, lesson_number);
