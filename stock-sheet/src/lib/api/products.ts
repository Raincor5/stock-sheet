/**
 * Products API
 * Query functions for product inventory
 */

import { supabase } from '@/lib/auth/client';
import type { Database } from '@/types/supabase';

type ProductRow = Database['public']['Tables']['products']['Row'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

/**
 * Fetch all active products for a store
 * @param storeId Store identifier
 * @returns Array of active (non-archived) products sorted by name
 */
export async function fetchProducts(storeId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .is('archived_at', null)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch a single product by ID
 * @param productId Product identifier
 * @returns Product row or null if not found/archived
 */
export async function fetchProductById(productId: string): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .is('archived_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch product: ${error.message}`);
  }

  return data;
}

/**
 * Fetch products below their low stock threshold
 * @param storeId Store identifier
 * @returns Array of low-stock products
 */
export async function fetchLowStockProducts(storeId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .is('archived_at', null)
    .gt('low_stock_threshold', 0)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch low stock products: ${error.message}`);
  }

  return data || [];
}

/**
 * Create a new product
 * Manager-only operation via RLS
 * @param product Product data to create
 * @returns Created product
 */
export async function createProduct(product: ProductInsert): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`);
  }

  return data;
}

/**
 * Update a product
 * Manager-only operation via RLS
 * @param productId Product identifier
 * @param updates Partial product data
 * @returns Updated product
 */
export async function updateProduct(
  productId: string,
  updates: ProductUpdate
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }

  return data;
}

/**
 * Archive a product (soft delete)
 * Manager-only operation via RLS
 * @param productId Product identifier
 * @returns Archived product
 */
export async function archiveProduct(productId: string): Promise<ProductRow> {
  return updateProduct(productId, {
    archived_at: new Date().toISOString(),
  });
}

/**
 * Restore an archived product
 * Manager-only operation via RLS
 * @param productId Product identifier
 * @returns Restored product
 */
export async function restoreProduct(productId: string): Promise<ProductRow> {
  return updateProduct(productId, {
    archived_at: null,
  });
}
