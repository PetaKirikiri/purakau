-- Optional config for auto-generating picture questions from sentences matching this pattern.
-- JSON shape: { "slot_index": number, "variants": [ { "label"?: string, "text": string } ] }
ALTER TABLE "sentence_patterns" ADD COLUMN IF NOT EXISTS "question_config" jsonb;
