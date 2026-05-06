-- Create sheet_templates table
CREATE TABLE sheet_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  columns jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_sheet_templates
  BEFORE UPDATE ON sheet_templates
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

/*
-- Rollback
DROP TRIGGER IF EXISTS set_updated_at_sheet_templates ON sheet_templates;
DROP TABLE sheet_templates;
*/
