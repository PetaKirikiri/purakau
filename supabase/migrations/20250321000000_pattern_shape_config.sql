-- Add shape_config to pos_chunk_patterns for per-pattern connector design.
ALTER TABLE "pos_chunk_patterns" ADD COLUMN IF NOT EXISTS "shape_config" jsonb NOT NULL DEFAULT '{}';
