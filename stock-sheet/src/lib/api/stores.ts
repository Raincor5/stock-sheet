/**
 * Stores API
 * Query functions for store data and store membership
 */

import { supabase } from '@/lib/auth/client';
import type { Database } from '@/types/supabase';

type StoreRow = Database['public']['Tables']['stores']['Row'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];
type StoreMemberRow = Database['public']['Tables']['store_members']['Row'];
type StoreMemberInsert = Database['public']['Tables']['store_members']['Insert'];

/**
 * Fetch all stores the current user belongs to
 * RLS policy filters automatically
 * @returns Array of stores
 */
export async function fetchMyStores(): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch stores: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch a single store by ID
 * RLS ensures user has access
 * @param storeId Store identifier
 * @returns Store row or null if not found/no access
 */
export async function fetchStoreById(storeId: string): Promise<StoreRow | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch store: ${error.message}`);
  }

  return data;
}

/**
 * Create a new store
 * Manager-only operation via RLS
 * @param store Store data to create
 * @returns Created store row
 */
export async function createStore(store: Pick<StoreInsert, 'name'>): Promise<StoreRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`Failed to verify signed-in user: ${userError.message}`);
  }

  const userId = userData.user?.id;

  if (!userId) {
    throw new Error('You must be signed in to create a store.');
  }

  const { data, error } = await supabase
    .from('stores')
    .insert([store])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create store: ${error.message}`);
  }

  const { error: memberError } = await supabase
    .from('store_members')
    .insert([{ store_id: data.id, user_id: userId, role: 'manager' }]);

  if (memberError) {
    await supabase.from('stores').delete().eq('id', data.id);
    throw new Error(`Failed to create store membership: ${memberError.message}`);
  }

  return data;
}

/**
 * Get the current user's role in a store
 * @param storeId Store identifier
 * @param userId User identifier
 * @returns 'manager' | 'staff' | null
 */
export async function getUserRoleInStore(
  storeId: string,
  userId: string
): Promise<'manager' | 'staff' | null> {
  const { data, error } = await supabase
    .from('store_members')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch user role: ${error.message}`);
  }

  return (data?.role as 'manager' | 'staff') || null;
}

/**
 * Fetch all members of a store
 * @param storeId Store identifier
 * @returns Array of store members
 */
export async function fetchStoreMembers(storeId: string): Promise<StoreMemberRow[]> {
  const { data, error } = await supabase
    .from('store_members')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch store members: ${error.message}`);
  }

  return data || [];
}

/**
 * Add a member to a store
 * Manager-only operation via RLS
 * @param member Member data to create
 * @returns Created member
 */
export async function addStoreMember(member: StoreMemberInsert): Promise<StoreMemberRow> {
  const { data, error } = await supabase
    .from('store_members')
    .insert([member])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add store member: ${error.message}`);
  }

  return data;
}

/**
 * Update a store member's role
 * Manager-only operation via RLS
 * @param memberId Member identifier
 * @param role New role ('manager' | 'staff')
 * @returns Updated member
 */
export async function updateStoreMemberRole(
  memberId: string,
  role: 'manager' | 'staff'
): Promise<StoreMemberRow> {
  const { data, error } = await supabase
    .from('store_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update member role: ${error.message}`);
  }

  return data;
}

/**
 * Remove a member from a store
 * Manager-only operation via RLS
 * @param memberId Member identifier
 */
export async function removeStoreMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('store_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    throw new Error(`Failed to remove store member: ${error.message}`);
  }
}
