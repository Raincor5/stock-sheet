-- Create stock_sheets table
CREATE TABLE stock_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sheet_template_id uuid NOT NULL REFERENCES sheet_templates(id) ON DELETE RESTRICT,
  date date NOT NULL,
  is_locked boolean DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

CREATE TRIGGER set_updated_at_stock_sheets
  BEFORE UPDATE ON stock_sheets
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

/*
-- Rollback
DROP TRIGGER IF EXISTS set_updated_at_stock_sheets ON stock_sheets;
DROP TABLE stock_sheets;
*/
