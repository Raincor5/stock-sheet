-- Support mixed sheet field types by storing entry values as text
ALTER TABLE sheet_entries
  ALTER COLUMN value TYPE text
  USING CASE
    WHEN value IS NULL THEN NULL
    ELSE value::text
  END;

/*
-- Rollback
ALTER TABLE sheet_entries
  ALTER COLUMN value TYPE integer
  USING CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    ELSE value::integer
  END;
*/
