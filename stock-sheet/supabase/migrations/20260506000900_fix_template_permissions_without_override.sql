CREATE OR REPLACE FUNCTION public.current_template_permissions(target_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_store_id uuid;
  current_role_id uuid;
  base_permissions jsonb := '{}'::jsonb;
  override_permissions jsonb := '{}'::jsonb;
BEGIN
  SELECT st.store_id
  INTO template_store_id
  FROM public.sheet_templates st
  WHERE st.id = target_template_id;

  IF template_store_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT sm.role_id, COALESCE(sr.permissions, '{}'::jsonb)
  INTO current_role_id, base_permissions
  FROM public.store_members sm
  JOIN public.store_roles sr
    ON sr.id = sm.role_id
  WHERE sm.store_id = template_store_id
    AND sm.user_id = auth.uid()
  LIMIT 1;

  IF current_role_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT stro.permissions
  INTO override_permissions
  FROM public.sheet_template_role_overrides stro
  WHERE stro.sheet_template_id = target_template_id
    AND stro.store_role_id = current_role_id
  LIMIT 1;

  RETURN base_permissions || COALESCE(override_permissions, '{}'::jsonb);
END;
$$;
