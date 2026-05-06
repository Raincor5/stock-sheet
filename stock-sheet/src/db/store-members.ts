import { supabase } from './client';
import type { Database } from '../types/supabase';

type StoreMember = Database['public']['Tables']['store_members']['Row'];
type StoreMemberInsert = Database['public']['Tables']['store_members']['Insert'];
type StoreMemberUpdate = Database['public']['Tables']['store_members']['Update'];

/**
 * Get all members of a store (requires manager role to modify)
 */
export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  const { data, error } = await supabase
    .from('store_members')
    .select('*')
    .eq('store_id', storeId);

  if (error) throw error;
  return data || [];
}

/**
 * Get a specific store member by ID
 */
export async function getStoreMemberById(memberId: string): Promise<StoreMember | null> {
  const { data, error } = await supabase
    .from('store_members')
    .select('*')
    .eq('id', memberId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Get current user's role in a store
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
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data?.role as 'manager' | 'staff') || null;
}

/**
 * Add a member to a store (requires manager role)
 */
export async function addStoreMember(
  member: StoreMemberInsert
): Promise<StoreMember> {
  const { data, error } = await supabase
    .from('store_members')
    .insert([member])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a store member's role (requires manager role)
 */
export async function updateStoreMemberRole(
  memberId: string,
  role: 'manager' | 'staff'
): Promise<StoreMember> {
  const { data, error } = await supabase
    .from('store_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove a member from a store (requires manager role)
 */
export async function removeStoreMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('store_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;
}
