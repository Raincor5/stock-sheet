/**
 * Products Query Hooks
 * TanStack Query wrappers for product operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProducts,
  fetchProductById,
  fetchLowStockProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
} from '@/lib/api/products';
import type { Database } from '@/types/supabase';

type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

const PRODUCT_CACHE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Fetch all active products for a store
 * @param storeId Store identifier
 * @returns Query result with products array
 */
export function useProducts(storeId: string | null) {
  return useQuery({
    queryKey: ['products', storeId],
    queryFn: () => fetchProducts(storeId!),
    enabled: !!storeId,
    staleTime: PRODUCT_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Fetch a single product by ID
 * @param productId Product identifier
 * @returns Query result with product data
 */
export function useProduct(productId: string | null) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductById(productId!),
    enabled: !!productId,
    staleTime: PRODUCT_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Fetch products below their low stock threshold
 * @param storeId Store identifier
 * @returns Query result with low-stock products
 */
export function useLowStockProducts(storeId: string | null) {
  return useQuery({
    queryKey: ['products', 'low-stock', storeId],
    queryFn: () => fetchLowStockProducts(storeId!),
    enabled: !!storeId,
    staleTime: PRODUCT_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Create a new product
 * Manager-only operation
 * @returns Mutation for creating product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: (newProduct) => {
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      console.error('Failed to create product:', error);
    },
    retry: 3,
  });
}

/**
 * Update a product
 * Manager-only operation
 * @returns Mutation for updating product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { productId: string; updates: ProductUpdate }) => {
      return updateProduct(params.productId, params.updates);
    },
    onSuccess: (updatedProduct) => {
      // Invalidate product and list queries
      queryClient.invalidateQueries({ queryKey: ['product', updatedProduct.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      console.error('Failed to update product:', error);
    },
    retry: 3,
  });
}

/**
 * Archive a product
 * Manager-only operation
 * @returns Mutation for archiving product
 */
export function useArchiveProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveProduct,
    onSuccess: (archivedProduct) => {
      queryClient.invalidateQueries({ queryKey: ['product', archivedProduct.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      console.error('Failed to archive product:', error);
    },
    retry: 3,
  });
}

/**
 * Restore an archived product
 * Manager-only operation
 * @returns Mutation for restoring product
 */
export function useRestoreProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreProduct,
    onSuccess: (restoredProduct) => {
      queryClient.invalidateQueries({ queryKey: ['product', restoredProduct.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      console.error('Failed to restore product:', error);
    },
    retry: 3,
  });
}
