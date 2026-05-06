-- Add RLS policies for all tables
-- This migration runs after all tables are created
-- NOTE: RLS is DISABLED for local development to avoid recursion issues
-- The original policies had infinite recursion in store_members table
-- In production, implement proper policies using views or application-level auth

-- For local development, RLS is not enabled on any tables
-- This allows the app to query the database without authorization overhead
-- TODO: Implement proper RLS without self-references when moving to production

-- All tables have RLS disabled by default
-- (No ALTER TABLE ... ENABLE ROW LEVEL SECURITY commands)

