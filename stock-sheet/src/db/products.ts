import { supabase } from './client';
import type { Database } from '../types/supabase';

type Product = Database['public']['Tables']['products']['Row'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

/**
 * Get all active (non-archived) products for a store
 */
export async function getProducts(storeId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .is('archived_at', null)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all products including archived ones (for admin/restoration purposes)
 */
export async function getAllProducts(
  storeId: string,
  includeArchived: boolean = false
): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId);

  if (!includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get a specific product by ID
 */
export async function getProductById(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .is('archived_at', null)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Create a new product (requires manager role)
 */
export async function createProduct(product: ProductInsert): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a product (requires manager role)
 */
export async function updateProduct(
  productId: string,
  updates: ProductUpdate
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft delete a product by setting archived_at timestamp (requires manager role)
 */
export async function archiveProduct(productId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', productId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Restore an archived product (requires manager role)
 */
export async function restoreProduct(productId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ archived_at: null })
    .eq('id', productId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get products below low stock threshold
 */
export async function getLowStockProducts(
  storeId: string
): Promise<(Product & { currentStock?: number })[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .is('archived_at', null)
    .gt('low_stock_threshold', 0);

  if (error) throw error;
  return data || [];
}
