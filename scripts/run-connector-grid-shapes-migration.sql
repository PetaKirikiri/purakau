-- Run this in Supabase SQL Editor to create connector_grid_shapes table.
-- Stores saved designs (lines + circles) from the Connectors page.

CREATE TABLE IF NOT EXISTS "connector_grid_shapes" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "lines" jsonb NOT NULL DEFAULT '[]',
  "circles" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_grid_shapes_name_idx" ON "connector_grid_shapes" ("name");
