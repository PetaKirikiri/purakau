-- Capability framework: registry (six areas), four-level ladder per area, student progress.
-- Lookup source of truth for reporting / tagging. Application must ensure current_level_id matches capability_id.

CREATE TABLE IF NOT EXISTS "capability_frameworks" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "capability_registry" (
  "id" serial PRIMARY KEY NOT NULL,
  "framework_id" integer NOT NULL REFERENCES "public"."capability_frameworks" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "domain" text,
  "description" text,
  "sort_order" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "capability_registry_framework_id_code_unique" UNIQUE ("framework_id", "code")
);

CREATE TABLE IF NOT EXISTS "capability_levels" (
  "id" serial PRIMARY KEY NOT NULL,
  "capability_id" integer NOT NULL REFERENCES "public"."capability_registry" ("id") ON DELETE CASCADE,
  "level_code" text NOT NULL,
  "level_order" integer NOT NULL,
  "official_standard_text" text,
  "plain_english_interpretation" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "capability_levels_capability_id_level_code_unique" UNIQUE ("capability_id", "level_code"),
  CONSTRAINT "capability_levels_capability_id_level_order_unique" UNIQUE ("capability_id", "level_order")
);

CREATE TABLE IF NOT EXISTS "student_capability_progress" (
  "id" serial PRIMARY KEY NOT NULL,
  "student_id" integer NOT NULL REFERENCES "public"."students" ("id") ON DELETE CASCADE,
  "capability_id" integer NOT NULL REFERENCES "public"."capability_registry" ("id") ON DELETE CASCADE,
  "current_level_id" integer NOT NULL REFERENCES "public"."capability_levels" ("id") ON DELETE RESTRICT,
  "progress_score" numeric,
  "evidence_count" integer NOT NULL DEFAULT 0,
  "last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_capability_progress_student_id_capability_id_unique" UNIQUE ("student_id", "capability_id")
);

CREATE INDEX IF NOT EXISTS "student_capability_progress_student_id_idx" ON "student_capability_progress" ("student_id");
CREATE INDEX IF NOT EXISTS "student_capability_progress_capability_id_idx" ON "student_capability_progress" ("capability_id");

-- Seed: one framework + six areas + 24 levels (same ladder text for each area in v1).

INSERT INTO "capability_frameworks" ("code", "name", "description", "sort_order", "is_active")
VALUES (
  'te_whainga_amorangi',
  'Te Whainga Amorangi',
  'Māori Crown Relations capability framework — six core areas, four levels each.',
  0,
  true
) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "capability_registry" ("framework_id", "code", "name", "domain", "description", "sort_order", "is_active")
SELECT f.id, v.code, v.name, v.domain, v.description, v.sort_order, true
FROM "capability_frameworks" f
CROSS JOIN (
  VALUES
    ('te_tiriti', 'Te Tiriti / NZ History', 'Foundation', 'Historical and constitutional awareness', 1),
    ('te_ao_maori', 'Te ao Māori', 'Worldview', 'Māori worldview and values', 2),
    ('tikanga_kawa', 'Tikanga / kawa', 'Practice', 'Protocols and customary practice', 3),
    ('te_reo_maori', 'Te reo Māori', 'Language', 'Māori language capability', 4),
    ('engagement_maori', 'Engagement with Māori', 'Relationships', 'Authentic engagement with Māori communities and partners', 5),
    ('racial_equity_systems', 'Racial equity / institutional systems', 'Systems', 'Equity across institutional systems', 6)
) AS v(code, name, domain, description, sort_order)
WHERE f.code = 'te_whainga_amorangi'
ON CONFLICT ("framework_id", "code") DO NOTHING;

INSERT INTO "capability_levels" (
  "capability_id",
  "level_code",
  "level_order",
  "official_standard_text",
  "plain_english_interpretation"
)
SELECT
  cr.id,
  lvl.level_code,
  lvl.level_order,
  lvl.official,
  lvl.plain
FROM "capability_registry" cr
INNER JOIN "capability_frameworks" f ON f.id = cr.framework_id AND f.code = 'te_whainga_amorangi'
CROSS JOIN (
  VALUES
    (
      'unfamiliar',
      1,
      'Unfamiliar',
      'No awareness; does not yet recognise importance. Starting state — passive.'
    ),
    (
      'comfortable',
      2,
      'Comfortable',
      'Knows basics; surface-level understanding; early exposure via lessons and content; not yet reliable in complex real-world situations.'
    ),
    (
      'confident',
      3,
      'Confident',
      'Applies appropriately in real situations; understands context; functional competence and independent use.'
    ),
    (
      'capable',
      4,
      'Capable',
      'Teaches others; leads decisions; deep transferable understanding. Rare; not the default expectation.'
    )
) AS lvl(level_code, level_order, official, plain)
ON CONFLICT ("capability_id", "level_code") DO NOTHING;

-- RLS: permissive policies for development (matches app_users setup).
-- Tighten before production: e.g. reference tables SELECT for authenticated; student_capability_progress limited to own student or staff role.

ALTER TABLE "capability_frameworks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capability_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capability_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_capability_progress" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capability_frameworks_select" ON "capability_frameworks" FOR SELECT USING (true);
CREATE POLICY "capability_registry_select" ON "capability_registry" FOR SELECT USING (true);
CREATE POLICY "capability_levels_select" ON "capability_levels" FOR SELECT USING (true);
CREATE POLICY "student_capability_progress_select" ON "student_capability_progress" FOR SELECT USING (true);
CREATE POLICY "student_capability_progress_insert" ON "student_capability_progress" FOR INSERT WITH CHECK (true);
CREATE POLICY "student_capability_progress_update" ON "student_capability_progress" FOR UPDATE USING (true);
CREATE POLICY "student_capability_progress_delete" ON "student_capability_progress" FOR DELETE USING (true);

-- Phase 2 (not implemented here): extend with:
--
-- capability_indicators (
--   id serial PK,
--   capability_level_id integer NOT NULL REFERENCES capability_levels(id) ON DELETE CASCADE,
--   indicator_type text NOT NULL,
--   indicator_text text NOT NULL,
--   is_core boolean NOT NULL DEFAULT false,
--   created_at timestamptz DEFAULT now()
-- )
--
-- content_capability_tags (
--   id serial PK,
--   content_type text NOT NULL,
--   content_id integer NOT NULL,
--   capability_id integer NOT NULL REFERENCES capability_registry(id) ON DELETE CASCADE,
--   capability_level_id integer REFERENCES capability_levels(id) ON DELETE SET NULL,
--   weight numeric,
--   created_at timestamptz DEFAULT now(),
--   UNIQUE (content_type, content_id, capability_id, capability_level_id)  -- adjust if nullable level
-- )
--
-- content_type examples: lesson, word, pattern, assessment (enforced via CHECK or app).
