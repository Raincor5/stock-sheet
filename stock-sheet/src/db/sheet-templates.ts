import { supabase } from './client';
import type { Database } from '../types/supabase';

type SheetTemplate = Database['public']['Tables']['sheet_templates']['Row'];
type SheetTemplateInsert = Database['public']['Tables']['sheet_templates']['Insert'];
type SheetTemplateUpdate = Database['public']['Tables']['sheet_templates']['Update'];

export interface ColumnDefinition {
  id: string;
  label: string;
  order: number;
  fieldType: 'number' | 'text' | 'boolean';
}

/**
 * Get all sheet templates for a store
 */
export async function getSheetTemplates(storeId: string): Promise<SheetTemplate[]> {
  const { data, error } = await supabase
    .from('sheet_templates')
    .select('*')
    .eq('store_id', storeId);

  if (error) throw error;
  return data || [];
}

/**
 * Get a specific sheet template by ID
 */
export async function getSheetTemplateById(
  templateId: string
): Promise<SheetTemplate | null> {
  const { data, error } = await supabase
    .from('sheet_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Get parsed column definitions from a sheet template
 */
export function parseTemplateColumns(
  template: SheetTemplate
): ColumnDefinition[] {
  try {
    const columns = Array.isArray(template.columns) ? template.columns : [];
    return columns as unknown as ColumnDefinition[];
  } catch {
    return [];
  }
}

/**
 * Create a new sheet template with columns (requires manager role)
 */
export async function createSheetTemplate(
  storeId: string,
  name: string,
  columns: ColumnDefinition[]
): Promise<SheetTemplate> {
  const { data, error } = await supabase
    .from('sheet_templates')
    .insert([
      {
        store_id: storeId,
        name,
        columns: columns as any,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update sheet template columns (requires manager role)
 */
export async function updateSheetTemplate(
  templateId: string,
  updates: Partial<{
    name: string;
    columns: ColumnDefinition[];
  }>
): Promise<SheetTemplate> {
  const updateData: SheetTemplateUpdate = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }

  if (updates.columns !== undefined) {
    updateData.columns = updates.columns as any;
  }

  const { data, error } = await supabase
    .from('sheet_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
