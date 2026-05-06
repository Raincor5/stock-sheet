-- Create moddatetime trigger function
-- This function automatically updates the updated_at timestamp
-- Based on the PostgreSQL moddatetime extension pattern
CREATE OR REPLACE FUNCTION moddatetime() 
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/*
-- Rollback
DROP FUNCTION IF EXISTS moddatetime();
*/
