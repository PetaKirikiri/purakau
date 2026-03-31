-- Connector presets: predefined shape configs to cycle through.
-- Users apply a preset to a pos_type + side, which upserts into connector_designs.

CREATE TABLE IF NOT EXISTS "connector_presets" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "shape_config" jsonb NOT NULL DEFAULT '{}',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "connector_presets" ("name", "shape_config", "sort_order") VALUES
  ('Flat', '{"type":"flat"}', 0),
  ('Round', '{"type":"round","radius":2}', 1),
  ('Bevel', '{"type":"bevel","inset":2,"angle":45}', 2),
  ('Notch', '{"type":"notch","notchDepth":1.5}', 3),
  ('Arrow', '{"type":"arrow","tipLength":2,"tipWidth":0}', 4),
  ('Koru', '{"type":"koru","radius":2.5,"tipLength":1}', 5)
ON CONFLICT (name) DO NOTHING;
