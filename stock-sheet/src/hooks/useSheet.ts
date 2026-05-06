/**
 * Sheet Query Hooks
 * TanStack Query wrappers for sheet operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSheetForDate,
  createSheet,
  fetchTodaySheet,
  fetchSheetHistory,
  saveSheetEntry,
  batchSaveEntries,
  lockSheet,
  unlockSheet,
  archiveSheet,
  restoreSheet,
  type SheetWithEntries,
} from '@/lib/api/sheets';
import { fetchSheetTemplates, saveAnalysisAsTemplate } from '@/lib/api/sheetTemplates';
import type { Database } from '@/types/supabase';

type SheetEntryInsert = Database['public']['Tables']['sheet_entries']['Insert'];

const SHEET_CACHE_TIME = 1000 * 60; // 1 minute

/**
 * Fetch a stock sheet by date
 * @param storeId Store identifier
 * @param date ISO date string (YYYY-MM-DD)
 * @returns Query result with sheet data
 */
export function useSheetByDate(storeId: string | null, date: string) {
  return useQuery({
    queryKey: ['sheet', storeId, date],
    queryFn: () => fetchSheetForDate(storeId!, date),
    enabled: !!storeId && !!date,
    staleTime: SHEET_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Fetch today's stock sheet
 * Auto-creates sheet if missing
 * @param storeId Store identifier
 * @param templateId Sheet template ID
 * @returns Query result with sheet data
 */
export function useTodaySheet(storeId: string | null, templateId: string | null) {
  return useQuery({
    queryKey: ['sheet', storeId, 'today'],
    queryFn: () => fetchTodaySheet(storeId!, templateId!),
    enabled: !!storeId && !!templateId,
    staleTime: SHEET_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Fetch all sheet templates for a store
 * @param storeId Store identifier
 * @returns Query result with template list
 */
export function useSheetTemplates(storeId: string | null) {
  return useQuery({
    queryKey: ['sheet-templates', storeId],
    queryFn: () => fetchSheetTemplates(storeId!),
    enabled: !!storeId,
    staleTime: SHEET_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Create or fetch today's sheet for a store
 * @returns Mutation for creating today's sheet
 */
export function useCreateTodaySheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { storeId: string; templateId: string }) =>
      fetchTodaySheet(params.storeId, params.templateId),
    onSuccess: (_sheet, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sheet', variables.storeId, 'today'] });
      queryClient.invalidateQueries({ queryKey: ['sheet', variables.storeId] });
    },
    onError: (error) => {
      console.error('Failed to create today sheet:', error);
    },
    retry: 3,
  });
}

/**
 * Create a new sheet instance from a selected template.
 * @returns Mutation for creating a sheet
 */
export function useCreateSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { storeId: string; templateId: string; date?: string }) =>
      createSheet(params.storeId, params.templateId, params.date),
    onSuccess: (_sheet, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
      queryClient.invalidateQueries({ queryKey: ['sheets', 'history', variables.storeId] });
    },
    onError: (error) => {
      console.error('Failed to create sheet:', error);
    },
    retry: 3,
  });
}

/**
 * Save a scanned sheet image result into the store template
 * @returns Mutation for saving template data
 */
export function useSaveAnalysisAsTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      storeId: string;
      analysis: import('@/lib/ai/types').SheetAnalysisResult;
      templateId?: string | null;
      templateName?: string | null;
    }) =>
      saveAnalysisAsTemplate(params.storeId, params.analysis, {
        templateId: params.templateId,
        templateName: params.templateName,
      }),
    onSuccess: (_template, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sheet-templates', variables.storeId] });
    },
    onError: (error) => {
      console.error('Failed to save sheet template:', error);
    },
    retry: 3,
  });
}

/**
 * Fetch sheet history for a date range
 * @param storeId Store identifier
 * @param startDate ISO date string (YYYY-MM-DD)
 * @param endDate ISO date string (YYYY-MM-DD)
 * @returns Query result with array of sheets
 */
export function useSheetHistory(
  storeId: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['sheets', 'history', storeId, startDate, endDate],
    queryFn: () => fetchSheetHistory(storeId!, startDate, endDate),
    enabled: !!storeId && !!startDate && !!endDate,
    staleTime: SHEET_CACHE_TIME,
    retry: 3,
  });
}

/**
 * Save a single sheet entry
 * @returns Mutation for saving an entry
 */
export function useSaveSheetEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSheetEntry,
    onSuccess: (data) => {
      // Invalidate all sheet queries to refetch with new data
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
    },
    onError: (error) => {
      console.error('Failed to save entry:', error);
    },
    retry: 3,
  });
}

/**
 * Save multiple sheet entries in batch
 * @returns Mutation for batch saving entries
 */
export function useBatchSaveEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchSaveEntries,
    onSuccess: () => {
      // Invalidate all sheet queries to refetch with new data
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
    },
    onError: (error) => {
      console.error('Failed to batch save entries:', error);
    },
    retry: 3,
  });
}

/**
 * Lock a stock sheet
 * Prevents further edits (manager only)
 * @returns Mutation for locking sheet
 */
export function useLockSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: lockSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
    },
    onError: (error) => {
      console.error('Failed to lock sheet:', error);
    },
    retry: 3,
  });
}

/**
 * Unlock a stock sheet
 * Manager-only operation
 * @returns Mutation for unlocking sheet
 */
export function useUnlockSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlockSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
    },
    onError: (error) => {
      console.error('Failed to unlock sheet:', error);
    },
    retry: 3,
  });
}

/**
 * Archive a stock sheet
 * Soft delete operation
 * @returns Mutation for archiving sheet
 */
export function useArchiveSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
      queryClient.invalidateQueries({ queryKey: ['sheets', 'history'] });
    },
    onError: (error) => {
      console.error('Failed to archive sheet:', error);
    },
    retry: 3,
  });
}

/**
 * Restore an archived stock sheet
 * @returns Mutation for restoring sheet
 */
export function useRestoreSheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet'] });
      queryClient.invalidateQueries({ queryKey: ['sheets', 'history'] });
    },
    onError: (error) => {
      console.error('Failed to restore sheet:', error);
    },
    retry: 3,
  });
}
