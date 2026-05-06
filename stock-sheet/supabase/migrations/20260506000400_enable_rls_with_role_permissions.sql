-- Enable row-level security using the normalized store role and document override model.

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', ''))
$$;

CREATE OR REPLACE FUNCTION public.store_has_no_members(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = target_store_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(
  target_store_id uuid,
  target_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = target_store_id
      AND sm.user_id = COALESCE(target_user_id, auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.does_role_belong_to_store(
  target_role_id uuid,
  target_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_roles sr
    WHERE sr.id = target_role_id
      AND sr.store_id = target_store_id
  )
$$;

CREATE OR REPLACE FUNCTION public.template_belongs_to_store(
  target_template_id uuid,
  target_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sheet_templates st
    WHERE st.id = target_template_id
      AND st.store_id = target_store_id
  )
$$;

CREATE OR REPLACE FUNCTION public.product_belongs_to_sheet_store(
  target_product_id uuid,
  target_sheet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.sheet_instances si
      ON si.store_id = p.store_id
    WHERE p.id = target_product_id
      AND si.id = target_sheet_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_store_role_id(target_store_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.role_id
  FROM public.store_members sm
  WHERE sm.store_id = target_store_id
    AND sm.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_store_permissions(target_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sr.permissions, '{}'::jsonb)
  FROM public.store_members sm
  JOIN public.store_roles sr
    ON sr.id = sm.role_id
  WHERE sm.store_id = target_store_id
    AND sm.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_store_permission(
  target_store_id uuid,
  permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (public.current_store_permissions(target_store_id) ->> permission_key)::boolean,
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.pending_invite_exists(
  target_store_id uuid,
  target_role_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_invites si
    WHERE si.store_id = target_store_id
      AND lower(si.email) = public.current_user_email()
      AND si.status = 'pending'
      AND (target_role_id IS NULL OR si.role_id = target_role_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_self_bootstrap_store_owner(
  target_store_id uuid,
  target_role_id uuid,
  target_user_id uuid,
  target_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_user_id = auth.uid()
    AND lower(COALESCE(target_email, '')) = public.current_user_email()
    AND public.store_has_no_members(target_store_id)
    AND EXISTS (
      SELECT 1
      FROM public.store_roles sr
      WHERE sr.id = target_role_id
        AND sr.store_id = target_store_id
        AND lower(sr.slug) = 'owner'
    )
$$;

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

  SELECT COALESCE(stro.permissions, '{}'::jsonb)
  INTO override_permissions
  FROM public.sheet_template_role_overrides stro
  WHERE stro.sheet_template_id = target_template_id
    AND stro.store_role_id = current_role_id
  LIMIT 1;

  RETURN base_permissions || override_permissions;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_template_permission(
  target_template_id uuid,
  permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (public.current_template_permissions(target_template_id) ->> permission_key)::boolean,
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.has_sheet_permission(
  target_sheet_id uuid,
  permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sheet_instances si
    WHERE si.id = target_sheet_id
      AND public.has_template_permission(si.sheet_template_id, permission_key)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_sheet_entries(target_sheet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sheet_instances si
    WHERE si.id = target_sheet_id
      AND si.archived_at IS NULL
      AND COALESCE(si.is_locked, false) = false
      AND public.has_template_permission(si.sheet_template_id, 'editDocuments')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_template_override(
  target_template_id uuid,
  target_store_role_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sheet_templates st
    JOIN public.store_roles sr
      ON sr.id = target_store_role_id
     AND sr.store_id = st.store_id
    WHERE st.id = target_template_id
      AND public.has_store_permission(st.store_id, 'manageDocumentPermissions')
  )
$$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_template_role_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_stores_for_members ON public.stores;
CREATE POLICY select_stores_for_members
ON public.stores
FOR SELECT
TO authenticated
USING (public.is_store_member(id));

DROP POLICY IF EXISTS insert_stores_for_authenticated_users ON public.stores;
CREATE POLICY insert_stores_for_authenticated_users
ON public.stores
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS update_stores_for_managers ON public.stores;
CREATE POLICY update_stores_for_managers
ON public.stores
FOR UPDATE
TO authenticated
USING (public.has_store_permission(id, 'manageMembers'))
WITH CHECK (public.has_store_permission(id, 'manageMembers'));

DROP POLICY IF EXISTS delete_unclaimed_or_managed_stores ON public.stores;
CREATE POLICY delete_unclaimed_or_managed_stores
ON public.stores
FOR DELETE
TO authenticated
USING (
  public.store_has_no_members(id)
  OR public.has_store_permission(id, 'manageMembers')
);

DROP POLICY IF EXISTS select_store_roles_for_members ON public.store_roles;
CREATE POLICY select_store_roles_for_members
ON public.store_roles
FOR SELECT
TO authenticated
USING (
  public.is_store_member(store_id)
  OR public.store_has_no_members(store_id)
);

DROP POLICY IF EXISTS insert_store_roles_for_role_managers ON public.store_roles;
CREATE POLICY insert_store_roles_for_role_managers
ON public.store_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_store_permission(store_id, 'manageRoles'));

DROP POLICY IF EXISTS update_store_roles_for_role_managers ON public.store_roles;
CREATE POLICY update_store_roles_for_role_managers
ON public.store_roles
FOR UPDATE
TO authenticated
USING (public.has_store_permission(store_id, 'manageRoles'))
WITH CHECK (public.has_store_permission(store_id, 'manageRoles'));

DROP POLICY IF EXISTS delete_custom_store_roles_for_role_managers ON public.store_roles;
CREATE POLICY delete_custom_store_roles_for_role_managers
ON public.store_roles
FOR DELETE
TO authenticated
USING (
  public.has_store_permission(store_id, 'manageRoles')
  AND NOT is_system
);

DROP POLICY IF EXISTS select_store_members_for_self_or_managers ON public.store_members;
CREATE POLICY select_store_members_for_self_or_managers
ON public.store_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_store_permission(store_id, 'manageMembers')
);

DROP POLICY IF EXISTS insert_store_members_for_bootstrap_invites_or_managers ON public.store_members;
CREATE POLICY insert_store_members_for_bootstrap_invites_or_managers
ON public.store_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_self_bootstrap_store_owner(store_id, role_id, user_id, member_email)
  OR (
    public.has_store_permission(store_id, 'manageMembers')
    AND public.does_role_belong_to_store(role_id, store_id)
  )
  OR (
    user_id = auth.uid()
    AND lower(member_email) = public.current_user_email()
    AND public.pending_invite_exists(store_id, role_id)
  )
);

DROP POLICY IF EXISTS update_store_members_for_invites_or_managers ON public.store_members;
CREATE POLICY update_store_members_for_invites_or_managers
ON public.store_members
FOR UPDATE
TO authenticated
USING (
  public.has_store_permission(store_id, 'manageMembers')
  OR (
    user_id = auth.uid()
    AND public.pending_invite_exists(store_id)
  )
)
WITH CHECK (
  (
    public.has_store_permission(store_id, 'manageMembers')
    AND public.does_role_belong_to_store(role_id, store_id)
  )
  OR (
    user_id = auth.uid()
    AND lower(member_email) = public.current_user_email()
    AND public.pending_invite_exists(store_id, role_id)
  )
);

DROP POLICY IF EXISTS delete_store_members_for_managers ON public.store_members;
CREATE POLICY delete_store_members_for_managers
ON public.store_members
FOR DELETE
TO authenticated
USING (public.has_store_permission(store_id, 'manageMembers'));

DROP POLICY IF EXISTS select_store_invites_for_invited_users_or_admins ON public.store_invites;
CREATE POLICY select_store_invites_for_invited_users_or_admins
ON public.store_invites
FOR SELECT
TO authenticated
USING (
  public.has_store_permission(store_id, 'inviteMembers')
  OR public.has_store_permission(store_id, 'manageMembers')
  OR (lower(email) = public.current_user_email() AND status = 'pending')
);

DROP POLICY IF EXISTS insert_store_invites_for_inviters ON public.store_invites;
CREATE POLICY insert_store_invites_for_inviters
ON public.store_invites
FOR INSERT
TO authenticated
WITH CHECK (
  invited_by_user_id = auth.uid()
  AND public.has_store_permission(store_id, 'inviteMembers')
  AND public.does_role_belong_to_store(role_id, store_id)
);

DROP POLICY IF EXISTS update_store_invites_for_invited_users_or_admins ON public.store_invites;
CREATE POLICY update_store_invites_for_invited_users_or_admins
ON public.store_invites
FOR UPDATE
TO authenticated
USING (
  public.has_store_permission(store_id, 'inviteMembers')
  OR public.has_store_permission(store_id, 'manageMembers')
  OR (lower(email) = public.current_user_email() AND status = 'pending')
)
WITH CHECK (
  public.does_role_belong_to_store(role_id, store_id)
  AND (
    public.has_store_permission(store_id, 'inviteMembers')
    OR public.has_store_permission(store_id, 'manageMembers')
    OR (lower(email) = public.current_user_email() AND status = 'accepted')
  )
);

DROP POLICY IF EXISTS delete_store_invites_for_admins ON public.store_invites;
CREATE POLICY delete_store_invites_for_admins
ON public.store_invites
FOR DELETE
TO authenticated
USING (
  public.has_store_permission(store_id, 'inviteMembers')
  OR public.has_store_permission(store_id, 'manageMembers')
);

DROP POLICY IF EXISTS select_sheet_templates_by_document_or_management_access ON public.sheet_templates;
CREATE POLICY select_sheet_templates_by_document_or_management_access
ON public.sheet_templates
FOR SELECT
TO authenticated
USING (
  public.has_store_permission(store_id, 'manageTemplates')
  OR public.has_store_permission(store_id, 'manageDocumentPermissions')
  OR public.has_template_permission(id, 'viewDocuments')
  OR public.has_template_permission(id, 'createDocuments')
  OR public.has_template_permission(id, 'editDocuments')
);

DROP POLICY IF EXISTS insert_sheet_templates_for_template_managers ON public.sheet_templates;
CREATE POLICY insert_sheet_templates_for_template_managers
ON public.sheet_templates
FOR INSERT
TO authenticated
WITH CHECK (public.has_store_permission(store_id, 'manageTemplates'));

DROP POLICY IF EXISTS update_sheet_templates_for_template_managers ON public.sheet_templates;
CREATE POLICY update_sheet_templates_for_template_managers
ON public.sheet_templates
FOR UPDATE
TO authenticated
USING (public.has_store_permission(store_id, 'manageTemplates'))
WITH CHECK (public.has_store_permission(store_id, 'manageTemplates'));

DROP POLICY IF EXISTS delete_sheet_templates_for_template_managers ON public.sheet_templates;
CREATE POLICY delete_sheet_templates_for_template_managers
ON public.sheet_templates
FOR DELETE
TO authenticated
USING (public.has_store_permission(store_id, 'manageTemplates'));

DROP POLICY IF EXISTS select_template_role_overrides_for_document_managers ON public.sheet_template_role_overrides;
CREATE POLICY select_template_role_overrides_for_document_managers
ON public.sheet_template_role_overrides
FOR SELECT
TO authenticated
USING (
  public.has_store_permission(
    (SELECT st.store_id FROM public.sheet_templates st WHERE st.id = sheet_template_id),
    'manageDocumentPermissions'
  )
  OR public.has_store_permission(
    (SELECT st.store_id FROM public.sheet_templates st WHERE st.id = sheet_template_id),
    'manageTemplates'
  )
);

DROP POLICY IF EXISTS insert_template_role_overrides_for_document_managers ON public.sheet_template_role_overrides;
CREATE POLICY insert_template_role_overrides_for_document_managers
ON public.sheet_template_role_overrides
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_template_override(sheet_template_id, store_role_id));

DROP POLICY IF EXISTS update_template_role_overrides_for_document_managers ON public.sheet_template_role_overrides;
CREATE POLICY update_template_role_overrides_for_document_managers
ON public.sheet_template_role_overrides
FOR UPDATE
TO authenticated
USING (public.can_manage_template_override(sheet_template_id, store_role_id))
WITH CHECK (public.can_manage_template_override(sheet_template_id, store_role_id));

DROP POLICY IF EXISTS delete_template_role_overrides_for_document_managers ON public.sheet_template_role_overrides;
CREATE POLICY delete_template_role_overrides_for_document_managers
ON public.sheet_template_role_overrides
FOR DELETE
TO authenticated
USING (public.can_manage_template_override(sheet_template_id, store_role_id));

DROP POLICY IF EXISTS select_sheet_instances_by_document_access ON public.sheet_instances;
CREATE POLICY select_sheet_instances_by_document_access
ON public.sheet_instances
FOR SELECT
TO authenticated
USING (public.has_template_permission(sheet_template_id, 'viewDocuments'));

DROP POLICY IF EXISTS insert_sheet_instances_by_document_create_access ON public.sheet_instances;
CREATE POLICY insert_sheet_instances_by_document_create_access
ON public.sheet_instances
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_template_permission(sheet_template_id, 'createDocuments')
  AND public.template_belongs_to_store(sheet_template_id, store_id)
);

DROP POLICY IF EXISTS update_sheet_instances_for_lock_or_archive_access ON public.sheet_instances;
CREATE POLICY update_sheet_instances_for_lock_or_archive_access
ON public.sheet_instances
FOR UPDATE
TO authenticated
USING (
  public.has_template_permission(sheet_template_id, 'lockDocuments')
  OR public.has_template_permission(sheet_template_id, 'archiveDocuments')
)
WITH CHECK (
  public.template_belongs_to_store(sheet_template_id, store_id)
  AND (
    public.has_template_permission(sheet_template_id, 'lockDocuments')
    OR public.has_template_permission(sheet_template_id, 'archiveDocuments')
  )
);

DROP POLICY IF EXISTS delete_sheet_instances_for_archive_access ON public.sheet_instances;
CREATE POLICY delete_sheet_instances_for_archive_access
ON public.sheet_instances
FOR DELETE
TO authenticated
USING (public.has_template_permission(sheet_template_id, 'archiveDocuments'));

DROP POLICY IF EXISTS select_sheet_entries_by_sheet_access ON public.sheet_entries;
CREATE POLICY select_sheet_entries_by_sheet_access
ON public.sheet_entries
FOR SELECT
TO authenticated
USING (public.has_sheet_permission(sheet_id, 'viewDocuments'));

DROP POLICY IF EXISTS insert_sheet_entries_for_editable_sheets ON public.sheet_entries;
CREATE POLICY insert_sheet_entries_for_editable_sheets
ON public.sheet_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_edit_sheet_entries(sheet_id)
  AND public.product_belongs_to_sheet_store(product_id, sheet_id)
);

DROP POLICY IF EXISTS update_sheet_entries_for_editable_sheets ON public.sheet_entries;
CREATE POLICY update_sheet_entries_for_editable_sheets
ON public.sheet_entries
FOR UPDATE
TO authenticated
USING (
  public.can_edit_sheet_entries(sheet_id)
  AND public.has_sheet_permission(sheet_id, 'editDocuments')
)
WITH CHECK (
  public.can_edit_sheet_entries(sheet_id)
  AND public.product_belongs_to_sheet_store(product_id, sheet_id)
);

DROP POLICY IF EXISTS delete_sheet_entries_for_editable_sheets ON public.sheet_entries;
CREATE POLICY delete_sheet_entries_for_editable_sheets
ON public.sheet_entries
FOR DELETE
TO authenticated
USING (public.can_edit_sheet_entries(sheet_id));

DROP POLICY IF EXISTS select_products_for_store_members ON public.products;
CREATE POLICY select_products_for_store_members
ON public.products
FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

DROP POLICY IF EXISTS insert_products_for_document_editors ON public.products;
CREATE POLICY insert_products_for_document_editors
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (public.has_store_permission(store_id, 'editDocuments'));

DROP POLICY IF EXISTS update_products_for_document_editors ON public.products;
CREATE POLICY update_products_for_document_editors
ON public.products
FOR UPDATE
TO authenticated
USING (public.has_store_permission(store_id, 'editDocuments'))
WITH CHECK (public.has_store_permission(store_id, 'editDocuments'));

DROP POLICY IF EXISTS delete_products_for_document_editors ON public.products;
CREATE POLICY delete_products_for_document_editors
ON public.products
FOR DELETE
TO authenticated
USING (public.has_store_permission(store_id, 'editDocuments'));
