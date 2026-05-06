/**
 * Stores Query Hooks
 * TanStack Query wrappers for store and membership operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createStore,
  fetchMyStores,
  fetchStoreById,
  getUserRoleInStore,
  fetchStoreMembers,
  addStoreMember,
  updateStoreMemberRole,
  removeStoreMember,
} from '@/lib/api/stores';
import type { Database } from '@/types/supabase';

type StoreMemberInsert = Database['public']['Tables']['store_members']['Insert'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];

const STORE_CACHE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Fetch all stores the current user belongs to
 * @returns Query result with stores array
 */
export function useMyStores() {
  return useQuery({
    queryKey: ['stores', 'my'],
    queryFn: fetchMyStores,
    staleTime: STORE_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Create a new store
 * @returns Mutation for creating stores
 */
export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (store: Pick<StoreInsert, 'name'>) => createStore(store),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores', 'my'] });
    },
    onError: (error) => {
      console.error('Failed to create store:', error);
    },
    retry: 3,
  });
}

/**
 * Fetch a single store by ID
 * @param storeId Store identifier
 * @returns Query result with store data
 */
export function useStore(storeId: string | null) {
  return useQuery({
    queryKey: ['store', storeId],
    queryFn: () => fetchStoreById(storeId!),
    enabled: !!storeId,
    staleTime: STORE_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Get the current user's role in a store
 * @param storeId Store identifier
 * @param userId User identifier
 * @returns Query result with role ('manager' | 'staff' | null)
 */
export function useUserRoleInStore(storeId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['store', storeId, 'user-role', userId],
    queryFn: () => getUserRoleInStore(storeId!, userId!),
    enabled: !!storeId && !!userId,
    staleTime: STORE_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Fetch all members of a store
 * @param storeId Store identifier
 * @returns Query result with members array
 */
export function useStoreMembers(storeId: string | null) {
  return useQuery({
    queryKey: ['store', storeId, 'members'],
    queryFn: () => fetchStoreMembers(storeId!),
    enabled: !!storeId,
    staleTime: STORE_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Add a member to a store
 * Manager-only operation
 * @returns Mutation for adding member
 */
export function useAddStoreMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addStoreMember,
    onSuccess: (newMember) => {
      // Invalidate store members list
      queryClient.invalidateQueries({ queryKey: ['store', newMember.store_id, 'members'] });
    },
    onError: (error) => {
      console.error('Failed to add store member:', error);
    },
    retry: 3,
  });
}

/**
 * Update a store member's role
 * Manager-only operation
 * @returns Mutation for updating member role
 */
export function useUpdateStoreMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { memberId: string; role: 'manager' | 'staff'; storeId: string }) => {
      return updateStoreMemberRole(params.memberId, params.role);
    },
    onSuccess: (updatedMember) => {
      // Invalidate store members list
      queryClient.invalidateQueries({ queryKey: ['store', updatedMember.store_id, 'members'] });
    },
    onError: (error) => {
      console.error('Failed to update member role:', error);
    },
    retry: 3,
  });
}

/**
 * Remove a member from a store
 * Manager-only operation
 * @returns Mutation for removing member
 */
export function useRemoveStoreMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { memberId: string; storeId: string }) => {
      return removeStoreMember(params.memberId);
    },
    onSuccess: (_, { storeId }) => {
      // Invalidate store members list
      queryClient.invalidateQueries({ queryKey: ['store', storeId, 'members'] });
    },
    onError: (error) => {
      console.error('Failed to remove store member:', error);
    },
    retry: 3,
  });
}
