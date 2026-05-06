/**
 * Real-time Subscription Hooks
 * Live data updates via Supabase Realtime
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/auth/client';

/**
 * Subscribe to real-time sheet entry updates
 * Invalidates sheet query when entries change, triggering a refetch
 * @param sheetId Sheet identifier to subscribe to
 * @param storeId Store identifier for query key
 */
export function useSheetRealtime(sheetId: string | null, storeId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sheetId || !storeId) return;

    const channel = supabase
      .channel(`sheet:${sheetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sheet_entries',
          filter: `sheet_id=eq.${sheetId}`,
        },
        () => {
          // Invalidate all sheet queries to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['sheet', storeId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sheetId, storeId, queryClient]);
}

/**
 * Subscribe to product updates for a store
 * Invalidates products query when products change
 * @param storeId Store identifier
 */
export function useProductsRealtime(storeId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`store:${storeId}:products`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          // Invalidate products queries
          queryClient.invalidateQueries({ queryKey: ['products', storeId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);
}

/**
 * Subscribe to store member updates
 * Invalidates members query when store_members table changes
 * @param storeId Store identifier
 */
export function useStoreMembersRealtime(storeId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`store:${storeId}:members`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_members',
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          // Invalidate store members queries
          queryClient.invalidateQueries({ queryKey: ['store', storeId, 'members'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);
}
