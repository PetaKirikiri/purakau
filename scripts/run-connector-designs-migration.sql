-- Run this in Supabase SQL Editor if connector_designs table is missing.
-- Creates connector_designs for per-POS left/right connector styles.

CREATE TABLE IF NOT EXISTS "connector_designs" (
  "id" serial PRIMARY KEY NOT NULL,
  "pos_type_id" integer NOT NULL REFERENCES "pos_types"("id") ON DELETE CASCADE,
  "side" text NOT NULL CHECK ("side" IN ('left', 'right')),
  "name" text,
  "shape_config" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("pos_type_id", "side")
);

CREATE INDEX IF NOT EXISTS "connector_designs_pos_type_idx" ON "connector_designs" ("pos_type_id");
