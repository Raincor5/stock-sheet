import { supabase } from './client';
import type { Database } from '../types/supabase';

type Store = Database['public']['Tables']['stores']['Row'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];
type StoreUpdate = Database['public']['Tables']['stores']['Update'];

/**
 * Get all stores the current user belongs to via store_members
 * RLS handles filtering automatically
 */
export async function getMyStores(): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*');

  if (error) throw error;
  return data || [];
}

/**
 * Get a specific store by ID
 * RLS ensures user has access
 */
export async function getStoreById(storeId: string): Promise<Store | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Create a new store (requires manager role)
 */
export async function createStore(store: StoreInsert): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .insert([store])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a store (requires manager role)
 */
export async function updateStore(
  storeId: string,
  updates: StoreUpdate
): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', storeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
