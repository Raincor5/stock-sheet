-- Create sheet_entries table
CREATE TABLE sheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES stock_sheets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  column_id text NOT NULL,
  value integer,
  is_pos_populated boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sheet_id, product_id, column_id)
);

CREATE TRIGGER set_updated_at_sheet_entries
  BEFORE UPDATE ON sheet_entries
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

/*
-- Rollback
DROP TRIGGER IF EXISTS set_updated_at_sheet_entries ON sheet_entries;
DROP TABLE sheet_entries;
*/
