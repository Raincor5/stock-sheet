import { supabase } from './client';
import type { Database } from '../types/supabase';

type SheetEntry = Database['public']['Tables']['sheet_entries']['Row'];
type SheetEntryInsert = Database['public']['Tables']['sheet_entries']['Insert'];
type SheetEntryUpdate = Database['public']['Tables']['sheet_entries']['Update'];

/**
 * Get all entries for a stock sheet
 */
export async function getSheetEntries(sheetId: string): Promise<SheetEntry[]> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('product_id', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all entries for a specific product across sheets
 */
export async function getProductEntries(productId: string): Promise<SheetEntry[]> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .select('*')
    .eq('product_id', productId)
    .order('sheet_id', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get a specific sheet entry by ID
 */
export async function getSheetEntryById(entryId: string): Promise<SheetEntry | null> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Get an entry for a specific sheet, product, and column
 */
export async function getSheetEntry(
  sheetId: string,
  productId: string,
  columnId: string
): Promise<SheetEntry | null> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .select('*')
    .eq('sheet_id', sheetId)
    .eq('product_id', productId)
    .eq('column_id', columnId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Upsert (create or update) a sheet entry
 */
export async function upsertSheetEntry(
  entry: SheetEntryInsert
): Promise<SheetEntry> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .upsert([entry])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create or update multiple sheet entries in batch
 */
export async function batchUpsertSheetEntries(
  entries: SheetEntryInsert[]
): Promise<SheetEntry[]> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .upsert(entries)
    .select();

  if (error) throw error;
  return data || [];
}

/**
 * Update a sheet entry value
 */
export async function updateSheetEntry(
  entryId: string,
  value: string | null,
  isPosPopulated?: boolean
): Promise<SheetEntry> {
  const updates: SheetEntryUpdate = { value };

  if (isPosPopulated !== undefined) {
    updates.is_pos_populated = isPosPopulated;
  }

  const { data, error } = await supabase
    .from('sheet_entries')
    .update(updates)
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update entry value by sheet, product, and column
 */
export async function updateSheetEntryByComposite(
  sheetId: string,
  productId: string,
  columnId: string,
  value: string | null,
  isPosPopulated?: boolean
): Promise<SheetEntry> {
  const updates: SheetEntryUpdate = { value };

  if (isPosPopulated !== undefined) {
    updates.is_pos_populated = isPosPopulated;
  }

  const { data, error } = await supabase
    .from('sheet_entries')
    .update(updates)
    .eq('sheet_id', sheetId)
    .eq('product_id', productId)
    .eq('column_id', columnId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a sheet entry
 */
export async function deleteSheetEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('sheet_entries')
    .delete()
    .eq('id', entryId);

  if (error) throw error;
}

/**
 * Mark entries as POS populated
 */
export async function markEntriesAsPosPopulated(
  sheetId: string,
  columnId: string
): Promise<SheetEntry[]> {
  const { data, error } = await supabase
    .from('sheet_entries')
    .update({ is_pos_populated: true })
    .eq('sheet_id', sheetId)
    .eq('column_id', columnId)
    .select();

  if (error) throw error;
  return data || [];
}
