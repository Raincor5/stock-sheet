/**
 * Sheet Templates API
 * Query functions for store sheet templates
 */

import { supabase } from '@/lib/auth/client';
import type { SheetAnalysisResult } from '@/lib/ai/types';
import type { Database } from '@/types/supabase';

type SheetTemplateRow = Database['public']['Tables']['sheet_templates']['Row'];
type SheetTemplateInsert = Database['public']['Tables']['sheet_templates']['Insert'];
type SheetTemplateUpdate = Database['public']['Tables']['sheet_templates']['Update'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];

export type TemplateFieldType = 'number' | 'text' | 'boolean';

export interface TemplateColumn {
	id: string;
	label: string;
	order: number;
	fieldType: TemplateFieldType;
}

export function normalizeLabel(value: string | null | undefined) {
	return (value ?? '').trim().replace(/\s+/g, ' ');
}

const BOOLEAN_FIELD_KEYWORDS = [
	'yes/no',
	'yes / no',
	'pass/fail',
	'pass / fail',
	'pass',
	'fail',
	'ok',
	'not ok',
	'complete',
	'completed',
	'done',
	'checked',
	'approved',
	'accepted',
	'compliant',
];

const TEXT_FIELD_KEYWORDS = [
	'note',
	'notes',
	'comment',
	'comments',
	'reason',
	'description',
	'details',
	'detail',
	'remark',
	'remarks',
	'issue',
	'issues',
	'action',
	'actions',
	'initials',
	'signature',
	'who',
];

export function normalizeTemplateName(value: string | null | undefined) {
	return normalizeLabel(value) || 'Untitled Template';
}

export function inferSheetFieldType(label: string): TemplateFieldType {
	const normalizedLabel = normalizeLabel(label).toLowerCase();
	if (BOOLEAN_FIELD_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword))) {
		return 'boolean';
	}
	return TEXT_FIELD_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword))
		? 'text'
		: 'number';
}

function normalizeSheetFieldType(
	fieldType: string | null | undefined,
	label: string
): TemplateFieldType {
	if (fieldType === 'number' || fieldType === 'text' || fieldType === 'boolean') {
		return fieldType;
	}

	if (fieldType === 'yes_no' || fieldType === 'yes-no' || fieldType === 'bool') {
		return 'boolean';
	}

	if (fieldType === 'display') {
		return 'text';
	}

	if (fieldType === 'additive' || fieldType === 'subtractive') {
		return 'number';
	}

	return inferSheetFieldType(label);
}

export function sanitizeTemplateColumns(
	columns: SheetAnalysisResult['columns'] | unknown
): TemplateColumn[] {
	if (!Array.isArray(columns)) {
		return [];
	}

	const seen = new Set<string>();
	const sanitized: TemplateColumn[] = [];

	columns.forEach((column) => {
		const rawLabel =
			typeof column === 'object' && column !== null && 'label' in column
				? (column as { label?: string }).label
				: '';
		const label = normalizeLabel(rawLabel);
		const normalizedKey = label.toLowerCase();

		if (!label || seen.has(normalizedKey)) {
			return;
		}

		seen.add(normalizedKey);
		sanitized.push({
			id: `col-${sanitized.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
			label,
			order: sanitized.length + 1,
			fieldType: normalizeSheetFieldType(
				typeof column === 'object' && column !== null && 'fieldType' in column
					? (column as { fieldType?: string }).fieldType
					: typeof column === 'object' && column !== null && 'type' in column
						? (column as { type?: string }).type
						: undefined,
				label
			),
		});
	});

	return sanitized;
}

export function extractTemplateColumns(
	template: Pick<SheetTemplateRow, 'columns'> | null | undefined
): TemplateColumn[] {
	if (!template || !Array.isArray(template.columns)) {
		return [];
	}

	const seen = new Set<string>();
	const extracted: TemplateColumn[] = [];

	template.columns.forEach((column, index) => {
		if (typeof column !== 'object' || column === null) {
			return;
		}

		const candidate = column as {
			id?: string;
			label?: string;
			order?: number;
			fieldType?: string;
			type?: string;
		};
		const label = normalizeLabel(candidate.label);
		const normalizedKey = label.toLowerCase();

		if (!label || seen.has(normalizedKey)) {
			return;
		}

		seen.add(normalizedKey);
		extracted.push({
			id:
				typeof candidate.id === 'string' && candidate.id.trim().length > 0
					? candidate.id
					: `col-${index + 1}`,
			label,
				order: typeof candidate.order === 'number' ? candidate.order : index + 1,
				fieldType: normalizeSheetFieldType(
					typeof candidate.fieldType === 'string'
						? candidate.fieldType
						: typeof candidate.type === 'string'
							? candidate.type
							: undefined,
					label
				),
			});
	});

	return extracted.sort((a, b) => a.order - b.order);
}

export function hasUsableTemplateColumns(
	template: Pick<SheetTemplateRow, 'columns'> | null | undefined
) {
	return extractTemplateColumns(template).length > 0;
}

export function getPrimaryUsableTemplate(templates: SheetTemplateRow[] | null | undefined) {
	if (!templates || templates.length === 0) {
		return null;
	}

	return templates.find((template) => hasUsableTemplateColumns(template)) ?? null;
}

export function getUsableTemplates(templates: SheetTemplateRow[] | null | undefined) {
	if (!templates) {
		return [];
	}

	return templates.filter((template) => hasUsableTemplateColumns(template));
}

function sanitizeProductNames(productNames: string[]): string[] {
	const seen = new Set<string>();

	return productNames
		.map((name) => normalizeLabel(name))
		.filter((name) => {
			const normalizedKey = name.toLowerCase();
			if (!name || seen.has(normalizedKey)) {
				return false;
			}

			seen.add(normalizedKey);
			return true;
		});
}

/**
 * Fetch all sheet templates for a store
 */
export async function fetchSheetTemplates(storeId: string): Promise<SheetTemplateRow[]> {
	const { data, error } = await supabase
		.from('sheet_templates')
		.select('*')
		.eq('store_id', storeId)
		.order('name', { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch sheet templates: ${error.message}`);
	}

	return data || [];
}

/**
 * Create a new sheet template for a store
 */
export async function createSheetTemplate(
	storeId: string,
	name: string,
	columns: TemplateColumn[]
): Promise<SheetTemplateRow> {
	const payload: SheetTemplateInsert = {
		store_id: storeId,
		name: normalizeTemplateName(name),
		columns: columns as unknown as SheetTemplateInsert['columns'],
	};

	const { data, error } = await supabase
		.from('sheet_templates')
		.insert([payload])
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to create sheet template: ${error.message}`);
	}

	return data;
}

/**
 * Update an existing sheet template.
 */
export async function updateSheetTemplate(
	templateId: string,
	updates: {
		name?: string;
		columns?: TemplateColumn[];
	}
): Promise<SheetTemplateRow> {
	const payload: SheetTemplateUpdate = {};

	if (updates.name !== undefined) {
		payload.name = normalizeTemplateName(updates.name);
	}

	if (updates.columns !== undefined) {
		payload.columns = updates.columns as unknown as SheetTemplateUpdate['columns'];
	}

	const { data, error } = await supabase
		.from('sheet_templates')
		.update(payload)
		.eq('id', templateId)
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to update sheet template: ${error.message}`);
	}

	return data;
}

/**
 * Save an AI analysis result into the store's primary sheet template.
 */
export async function saveAnalysisAsTemplate(
	storeId: string,
	analysis: SheetAnalysisResult,
	options?: {
		templateId?: string | null;
		templateName?: string | null;
	}
): Promise<SheetTemplateRow> {
	const templates = await fetchSheetTemplates(storeId);
	const columns = sanitizeTemplateColumns(analysis.columns);
	const templateName = normalizeTemplateName(options?.templateName ?? analysis.sheetTitle);

	if (columns.length === 0) {
		throw new Error('No usable columns were detected. Please retake or upload a clearer sheet photo.');
	}

	const duplicateTemplate = templates.find(
		(template) =>
			template.id !== options?.templateId &&
			normalizeTemplateName(template.name).toLowerCase() === templateName.toLowerCase()
	);

	if (duplicateTemplate) {
		throw new Error(`A template named "${templateName}" already exists for this store.`);
	}

	let template: SheetTemplateRow;
	if (options?.templateId) {
		template = await updateSheetTemplate(options.templateId, {
			name: templateName,
			columns,
		});
	} else {
		template = await createSheetTemplate(storeId, templateName, columns);
	}

	// Create products from analysis (ignore duplicates)
	await createProductsFromAnalysis(storeId, sanitizeProductNames(analysis.products));

	return template;
}

/**
 * Create products for a store from a list of product names.
 * Ignores products that already exist (duplicate names).
 */
async function createProductsFromAnalysis(storeId: string, productNames: string[]): Promise<void> {
	if (productNames.length === 0) {
		return;
	}

	// Fetch existing products for this store
	const { data: existingProducts, error: fetchError } = await supabase
		.from('products')
		.select('name')
		.eq('store_id', storeId)
		.is('archived_at', null);

	if (fetchError) {
		console.error('Failed to fetch existing products:', fetchError);
		return; // Don't fail the template save if product check fails
	}

	const existingNames = new Set(
		(existingProducts || []).map((product) => normalizeLabel(product.name).toLowerCase())
	);

	// Filter out duplicates and prepare new products
	const newProducts: ProductInsert[] = productNames
		.filter((name) => name.trim().length > 0)
		.filter((name) => !existingNames.has(name.toLowerCase()))
		.map((name) => ({
			store_id: storeId,
			name: normalizeLabel(name),
		}));

	// Batch insert new products (ignore conflicts)
	if (newProducts.length > 0) {
		const { error: insertError } = await supabase
			.from('products')
			.insert(newProducts)
			.select();

		if (insertError) {
			console.error('Failed to create products:', insertError);
			// Don't fail the template save if product creation fails
		}
	}
}
