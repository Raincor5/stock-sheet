-- Create store_members table
CREATE TABLE store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, user_id)
);

CREATE TRIGGER set_updated_at_store_members
  BEFORE UPDATE ON store_members
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

/*
-- Rollback
DROP TRIGGER IF EXISTS set_updated_at_store_members ON store_members;
DROP TABLE store_members;
*/
