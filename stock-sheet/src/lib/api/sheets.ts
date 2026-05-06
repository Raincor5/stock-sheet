/**
 * Stock Sheet API
 * Query functions for sheets and sheet entries
 */

import { supabase } from '@/lib/auth/client';
import type { Database } from '@/types/supabase';

type SheetRow = Database['public']['Tables']['stock_sheets']['Row'];
type SheetEntryRow = Database['public']['Tables']['sheet_entries']['Row'];
type SheetEntryInsert = Database['public']['Tables']['sheet_entries']['Insert'];
type SheetEntryUpdate = Database['public']['Tables']['sheet_entries']['Update'];

export interface SheetWithEntries extends SheetRow {
  sheet_entries: SheetEntryRow[];
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

const SHEET_WITH_ENTRIES_SELECT = `
  id,
  store_id,
  sheet_template_id,
  date,
  is_locked,
  archived_at,
  created_at,
  updated_at,
  sheet_entries (
    id,
    sheet_id,
    product_id,
    column_id,
    value,
    is_pos_populated,
    created_at,
    updated_at
  )
`;

/**
 * Fetch the most recently created sheet for a store on a given date.
 * @param storeId Store identifier
 * @param date ISO date string (YYYY-MM-DD)
 * @returns Latest matching sheet with nested entries or null if not found
 */
export async function fetchSheetForDate(
  storeId: string,
  date: string
): Promise<SheetWithEntries | null> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .select(SHEET_WITH_ENTRIES_SELECT)
    .eq('store_id', storeId)
    .eq('date', date)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch sheet: ${error.message}`);
  }

  return data as SheetWithEntries | null;
}

/**
 * Create a new sheet instance for a store and template.
 * @param storeId Store identifier
 * @param templateId Sheet template ID to use
 * @param date ISO date string (YYYY-MM-DD), defaults to today
 * @returns Newly created sheet with nested entries
 */
export async function createSheet(
  storeId: string,
  templateId: string,
  date: string = getTodayDateString()
): Promise<SheetWithEntries> {
  const { data: created, error: createError } = await supabase
    .from('stock_sheets')
    .insert([
      {
        store_id: storeId,
        sheet_template_id: templateId,
        date,
        is_locked: false,
      },
    ])
    .select(SHEET_WITH_ENTRIES_SELECT)
    .single();

  if (createError) {
    throw new Error(`Failed to create sheet: ${createError.message}`);
  }

  return created as SheetWithEntries;
}

/**
 * Legacy helper kept for compatibility with older code paths.
 */
export async function fetchTodaySheet(storeId: string, templateId: string): Promise<SheetWithEntries> {
  return createSheet(storeId, templateId, getTodayDateString());
}

/**
 * Fetch sheet history for a date range
 * @param storeId Store identifier
 * @param startDate ISO date string (YYYY-MM-DD)
 * @param endDate ISO date string (YYYY-MM-DD)
 * @returns Array of sheets in descending date order
 */
export async function fetchSheetHistory(
  storeId: string,
  startDate: string,
  endDate: string
): Promise<SheetRow[]> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .select('*')
    .eq('store_id', storeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .is('archived_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch sheet history: ${error.message}`);
  }

  return data || [];
}

/**
 * Save or update a single sheet entry
 * @param entry Entry data to upsert
 */
export async function saveSheetEntry(entry: SheetEntryInsert): Promise<SheetEntryRow> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .upsert([entry], {
      onConflict: 'sheet_id,product_id,column_id',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save entry: ${error.message}`);
  }

  return data;
}

/**
 * Save multiple sheet entries in batch
 * @param entries Array of entries to upsert
 * @returns Array of saved entries
 */
export async function batchSaveEntries(entries: SheetEntryInsert[]): Promise<SheetEntryRow[]> {
  if (entries.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('sheet_entries')
    .upsert(entries, {
      onConflict: 'sheet_id,product_id,column_id',
    })
    .select();

  if (error) {
    throw new Error(`Failed to batch save entries: ${error.message}`);
  }

  return data || [];
}

/**
 * Lock a stock sheet to prevent further edits
 * @param sheetId Sheet identifier
 */
export async function lockSheet(sheetId: string): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .update({ is_locked: true })
    .eq('id', sheetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to lock sheet: ${error.message}`);
  }

  return data;
}

/**
 * Unlock a stock sheet (manager only)
 * @param sheetId Sheet identifier
 */
export async function unlockSheet(sheetId: string): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .update({ is_locked: false })
    .eq('id', sheetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to unlock sheet: ${error.message}`);
  }

  return data;
}

/**
 * Archive a stock sheet (soft delete)
 * @param sheetId Sheet identifier
 */
export async function archiveSheet(sheetId: string): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', sheetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to archive sheet: ${error.message}`);
  }

  return data;
}

/**
 * Restore an archived stock sheet
 * @param sheetId Sheet identifier
 */
export async function restoreSheet(sheetId: string): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .update({ archived_at: null })
    .eq('id', sheetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to restore sheet: ${error.message}`);
  }

  return data;
}
