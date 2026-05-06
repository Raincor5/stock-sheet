CREATE OR REPLACE FUNCTION public.can_accept_own_pending_invite(
  target_invite_id uuid,
  target_store_id uuid,
  target_role_id uuid,
  target_email text,
  target_status text
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
    WHERE si.id = target_invite_id
      AND si.store_id = target_store_id
      AND si.role_id = target_role_id
      AND lower(si.email) = lower(COALESCE(target_email, ''))
      AND lower(si.email) = public.current_user_email()
      AND si.status = 'pending'
      AND target_status IN ('pending', 'accepted')
  )
$$;

DROP POLICY IF EXISTS update_store_invites_for_invited_users_or_admins ON public.store_invites;

CREATE POLICY update_store_invites_for_invited_users_or_admins
ON public.store_invites
FOR UPDATE
TO authenticated
USING (
  public.has_store_permission(store_id, 'inviteMembers')
  OR public.has_store_permission(store_id, 'manageMembers')
  OR public.can_accept_own_pending_invite(id, store_id, role_id, email, status)
)
WITH CHECK (
  public.does_role_belong_to_store(role_id, store_id)
  AND (
    public.has_store_permission(store_id, 'inviteMembers')
    OR public.has_store_permission(store_id, 'manageMembers')
    OR public.can_accept_own_pending_invite(id, store_id, role_id, email, status)
  )
);
