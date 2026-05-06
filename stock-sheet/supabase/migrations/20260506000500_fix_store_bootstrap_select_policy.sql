DROP POLICY IF EXISTS select_stores_for_members ON public.stores;

CREATE POLICY select_stores_for_members
ON public.stores
FOR SELECT
TO authenticated
USING (
  public.is_store_member(id)
  OR public.store_has_no_members(id)
);
