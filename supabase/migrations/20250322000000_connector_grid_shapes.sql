-- Connector grid shapes: saved designs from the Connectors page.
-- Lines and circles drawn on the grid, persisted for drag-drop reuse.

CREATE TABLE IF NOT EXISTS "connector_grid_shapes" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "lines" jsonb NOT NULL DEFAULT '[]',
  "circles" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_grid_shapes_name_idx" ON "connector_grid_shapes" ("name");
