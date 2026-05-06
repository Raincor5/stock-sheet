-- Name reusable templates and allow multiple sheets on the same date
ALTER TABLE sheet_templates
  ADD COLUMN name text;

UPDATE sheet_templates
SET name = COALESCE(NULLIF(name, ''), 'Template ' || substr(id::text, 1, 8));

ALTER TABLE sheet_templates
  ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sheet_templates_store_id_lower_name_idx
  ON sheet_templates (store_id, lower(name));

ALTER TABLE stock_sheets
  DROP CONSTRAINT IF EXISTS stock_sheets_store_id_date_key;

/*
-- Rollback
ALTER TABLE stock_sheets
  ADD CONSTRAINT stock_sheets_store_id_date_key UNIQUE (store_id, date);

DROP INDEX IF EXISTS sheet_templates_store_id_lower_name_idx;

ALTER TABLE sheet_templates
  DROP COLUMN IF EXISTS name;
*/
