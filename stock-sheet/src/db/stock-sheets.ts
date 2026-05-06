import { supabase } from './client';
import type { Database } from '../types/supabase';

type StockSheet = Database['public']['Tables']['stock_sheets']['Row'];
type StockSheetInsert = Database['public']['Tables']['stock_sheets']['Insert'];
type StockSheetUpdate = Database['public']['Tables']['stock_sheets']['Update'];

/**
 * Get stock sheets for a store, optionally filtered by date range
 */
export async function getStockSheets(
  storeId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    includeArchived?: boolean;
  }
): Promise<StockSheet[]> {
  let query = supabase
    .from('stock_sheets')
    .select('*')
    .eq('store_id', storeId);

  if (filters?.startDate) {
    query = query.gte('date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('date', filters.endDate);
  }

  if (!filters?.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get a stock sheet by ID
 */
export async function getStockSheetById(sheetId: string): Promise<StockSheet | null> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .select('*')
    .eq('id', sheetId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Get or create today's stock sheet for a store
 */
export async function getTodayStockSheet(
  storeId: string,
  templateId: string
): Promise<StockSheet> {
  const today = new Date().toISOString().split('T')[0];

  // Try to find existing sheet for today
  const { data: existing, error: selectError } = await supabase
    .from('stock_sheets')
    .select('*')
    .eq('store_id', storeId)
    .eq('date', today)
    .is('archived_at', null)
    .single();

  if (existing) {
    return existing;
  }

  if (selectError && selectError.code !== 'PGRST116') {
    throw selectError;
  }

  // Create new sheet for today
  const { data: created, error: insertError } = await supabase
    .from('stock_sheets')
    .insert([
      {
        store_id: storeId,
        sheet_template_id: templateId,
        date: today,
        is_locked: false,
      },
    ])
    .select()
    .single();

  if (insertError) throw insertError;
  return created;
}

/**
 * Create a new stock sheet (requires manager role)
 */
export async function createStockSheet(
  sheet: StockSheetInsert
): Promise<StockSheet> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .insert([sheet])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a stock sheet (requires manager role)
 */
export async function updateStockSheet(
  sheetId: string,
  updates: StockSheetUpdate
): Promise<StockSheet> {
  const { data, error } = await supabase
    .from('stock_sheets')
    .update(updates)
    .eq('id', sheetId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lock a stock sheet to prevent further edits
 */
export async function lockStockSheet(sheetId: string): Promise<StockSheet> {
  return updateStockSheet(sheetId, { is_locked: true });
}

/**
 * Unlock a stock sheet (requires manager role)
 */
export async function unlockStockSheet(sheetId: string): Promise<StockSheet> {
  return updateStockSheet(sheetId, { is_locked: false });
}

/**
 * Archive a stock sheet (soft delete)
 */
export async function archiveStockSheet(sheetId: string): Promise<StockSheet> {
  return updateStockSheet(sheetId, {
    archived_at: new Date().toISOString(),
  });
}

/**
 * Restore an archived stock sheet
 */
export async function restoreStockSheet(sheetId: string): Promise<StockSheet> {
  return updateStockSheet(sheetId, { archived_at: null });
}
