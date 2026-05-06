CREATE OR REPLACE FUNCTION public.prevent_store_invite_identity_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.role_id IS DISTINCT FROM OLD.role_id
    OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id
    OR lower(COALESCE(NEW.email, '')) IS DISTINCT FROM lower(COALESCE(OLD.email, ''))
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Store invite identity fields cannot be changed after creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_store_invite_identity_changes_before_update ON public.store_invites;
CREATE TRIGGER prevent_store_invite_identity_changes_before_update
  BEFORE UPDATE ON public.store_invites
  FOR EACH ROW EXECUTE FUNCTION public.prevent_store_invite_identity_changes();

DROP POLICY IF EXISTS select_store_invites_for_invited_users_or_admins ON public.store_invites;
CREATE POLICY select_store_invites_for_invited_users_or_admins
ON public.store_invites
FOR SELECT
TO authenticated
USING (
  public.has_store_permission(store_id, 'inviteMembers')
  OR public.has_store_permission(store_id, 'manageMembers')
  OR lower(email) = public.current_user_email()
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
