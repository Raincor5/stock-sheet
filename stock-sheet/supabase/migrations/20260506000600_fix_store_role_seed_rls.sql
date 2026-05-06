CREATE OR REPLACE FUNCTION seed_default_store_roles(target_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO store_roles (store_id, slug, name, permissions, is_system)
  VALUES
    (target_store_id, 'owner', 'Owner', default_store_role_permissions('owner'), true),
    (target_store_id, 'manager', 'Manager', default_store_role_permissions('manager'), true),
    (target_store_id, 'employee', 'Employee', default_store_role_permissions('employee'), true)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION seed_default_store_roles_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_default_store_roles(NEW.id);
  RETURN NEW;
END;
$$;
