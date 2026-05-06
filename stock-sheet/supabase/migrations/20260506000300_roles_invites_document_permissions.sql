-- Normalize roles and invitations, add per-template access overrides,
-- and rename stock_sheets to the more accurate sheet_instances.

ALTER TABLE stock_sheets
  RENAME TO sheet_instances;

CREATE TABLE store_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX store_roles_store_id_lower_slug_idx
  ON store_roles (store_id, lower(slug));

CREATE UNIQUE INDEX store_roles_store_id_lower_name_idx
  ON store_roles (store_id, lower(name));

CREATE TRIGGER set_updated_at_store_roles
  BEFORE UPDATE ON store_roles
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

CREATE OR REPLACE FUNCTION default_store_role_permissions(target_slug text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE lower(target_slug)
    WHEN 'owner' THEN
      RETURN jsonb_build_object(
        'viewDocuments', true,
        'createDocuments', true,
        'editDocuments', true,
        'lockDocuments', true,
        'archiveDocuments', true,
        'manageTemplates', true,
        'manageMembers', true,
        'inviteMembers', true,
        'manageRoles', true,
        'manageDocumentPermissions', true
      );
    WHEN 'manager' THEN
      RETURN jsonb_build_object(
        'viewDocuments', true,
        'createDocuments', true,
        'editDocuments', true,
        'lockDocuments', true,
        'archiveDocuments', true,
        'manageTemplates', true,
        'manageMembers', false,
        'inviteMembers', false,
        'manageRoles', false,
        'manageDocumentPermissions', false
      );
    ELSE
      RETURN jsonb_build_object(
        'viewDocuments', true,
        'createDocuments', true,
        'editDocuments', true,
        'lockDocuments', false,
        'archiveDocuments', false,
        'manageTemplates', false,
        'manageMembers', false,
        'inviteMembers', false,
        'manageRoles', false,
        'manageDocumentPermissions', false
      );
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION seed_default_store_roles(target_store_id uuid)
RETURNS void
LANGUAGE plpgsql
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
AS $$
BEGIN
  PERFORM seed_default_store_roles(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_default_store_roles_after_insert
  AFTER INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION seed_default_store_roles_trigger();

SELECT seed_default_store_roles(id)
FROM stores;

ALTER TABLE store_members
  ADD COLUMN role_id uuid REFERENCES store_roles(id) ON DELETE RESTRICT,
  ADD COLUMN member_email text;

WITH ranked_members AS (
  SELECT
    sm.id,
    sm.store_id,
    sm.user_id,
    sm.role,
    ROW_NUMBER() OVER (PARTITION BY sm.store_id ORDER BY sm.created_at, sm.id) AS membership_order
  FROM store_members sm
),
resolved_members AS (
  SELECT
    rm.id AS member_id,
    sr.id AS role_id,
    COALESCE(au.email, rm.user_id::text) AS member_email
  FROM ranked_members rm
  JOIN store_roles sr
    ON sr.store_id = rm.store_id
   AND lower(sr.slug) = CASE
     WHEN lower(rm.role) = 'staff' THEN 'employee'
     WHEN lower(rm.role) = 'manager' AND rm.membership_order = 1 THEN 'owner'
     ELSE 'manager'
   END
  LEFT JOIN auth.users au
    ON au.id = rm.user_id
)
UPDATE store_members sm
SET
  role_id = resolved_members.role_id,
  member_email = resolved_members.member_email
FROM resolved_members
WHERE sm.id = resolved_members.member_id;

ALTER TABLE store_members
  ALTER COLUMN role_id SET NOT NULL,
  ALTER COLUMN member_email SET NOT NULL;

ALTER TABLE store_members
  DROP CONSTRAINT IF EXISTS store_members_store_id_user_id_key;

ALTER TABLE store_members
  DROP CONSTRAINT IF EXISTS store_members_role_check;

ALTER TABLE store_members
  DROP COLUMN role;

ALTER TABLE store_members
  ADD CONSTRAINT store_members_store_id_user_id_key UNIQUE (store_id, user_id);

CREATE INDEX store_members_role_id_idx
  ON store_members (role_id);

CREATE TABLE store_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES store_roles(id) ON DELETE RESTRICT,
  invited_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX store_invites_store_id_lower_email_pending_idx
  ON store_invites (store_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX store_invites_role_id_idx
  ON store_invites (role_id);

CREATE TRIGGER set_updated_at_store_invites
  BEFORE UPDATE ON store_invites
  FOR EACH ROW EXECUTE FUNCTION moddatetime();

CREATE TABLE sheet_template_role_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_template_id uuid NOT NULL REFERENCES sheet_templates(id) ON DELETE CASCADE,
  store_role_id uuid NOT NULL REFERENCES store_roles(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_template_id, store_role_id)
);

CREATE INDEX sheet_template_role_overrides_role_id_idx
  ON sheet_template_role_overrides (store_role_id);

CREATE TRIGGER set_updated_at_sheet_template_role_overrides
  BEFORE UPDATE ON sheet_template_role_overrides
  FOR EACH ROW EXECUTE FUNCTION moddatetime();
