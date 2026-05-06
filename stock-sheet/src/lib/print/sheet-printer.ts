import * as Print from 'expo-print';
import type { Database } from '@/types/supabase';

type TemplateColumn = {
	id: string;
	label: string;
	order?: number;
	fieldType?: 'number' | 'text' | 'boolean';
};
type Product = Database['public']['Tables']['products']['Row'];
type SheetEntry = Database['public']['Tables']['sheet_entries']['Row'];

const ENTRY_KEY_SEPARATOR = '::';

function buildEntryKey(productId: string, columnId: string) {
	return `${productId}${ENTRY_KEY_SEPARATOR}${columnId}`;
}

export interface SheetPrintData {
	storeId: string;
	storeName: string;
	sheetDate: string;
	columns: TemplateColumn[];
	products: Product[];
	entries: SheetEntry[];
	values: Record<string, string | null>;
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Generate HTML for sheet printing
 */
function generateSheetHTML(data: SheetPrintData): string {
	const dateStr = new Date(data.sheetDate).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});

	const headerRows = `
		<tr style="background-color: #f0f0f0; border-bottom: 2px solid #000;">
			<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Product</th>
			${data.columns.map((col) => `<th style="border: 1px solid #ccc; padding: 8px; text-align: center;">${escapeHtml(col.label)}</th>`).join('')}
		</tr>
	`;

	const dataRows = data.products
		.map((product) => {
			const cells = data.columns
				.map((col) => {
					const key = buildEntryKey(product.id, col.id);
					const value = data.values[key];
					const displayValue = typeof value === 'string' && value.trim().length > 0 ? value : '-';
					return `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${escapeHtml(displayValue)}</td>`;
				})
				.join('');

			return `
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; font-weight: 500;">${escapeHtml(product.name)}</td>
					${cells}
				</tr>
			`;
		})
		.join('');

	const html = `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<title>Sheet</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					margin: 20px;
					color: #333;
				}
				.header {
					margin-bottom: 20px;
					border-bottom: 2px solid #000;
					padding-bottom: 10px;
				}
				.store-name {
					font-size: 24px;
					font-weight: bold;
					margin-bottom: 5px;
				}
				.sheet-date {
					font-size: 16px;
					color: #666;
				}
				table {
					width: 100%;
					border-collapse: collapse;
					margin-top: 20px;
				}
				th {
					background-color: #f0f0f0;
					border: 1px solid #ccc;
					padding: 8px;
					text-align: center;
					font-weight: bold;
				}
				td {
					border: 1px solid #ddd;
					padding: 8px;
					text-align: center;
				}
				td:first-child {
					text-align: left;
					font-weight: 500;
				}
				.footer {
					margin-top: 20px;
					text-align: right;
					font-size: 12px;
					color: #999;
				}
			</style>
		</head>
		<body>
			<div class="header">
				<div class="store-name">${escapeHtml(data.storeName)}</div>
				<div class="sheet-date">Sheet - ${dateStr}</div>
			</div>

			<table>
				${headerRows}
				${dataRows}
			</table>

			<div class="footer">
				<p>Generated on ${new Date().toLocaleString()}</p>
			</div>
		</body>
		</html>
	`;

	return html;
}

/**
 * Print a stock sheet with current data
 */
export async function printSheet(data: SheetPrintData): Promise<void> {
	const html = generateSheetHTML(data);

	try {
		await Print.printAsync({
			html,
			printerUrl: undefined,
		});
	} catch (error) {
		console.error('Error printing sheet:', error);
		throw error;
	}
}

/**
 * Share/save sheet as PDF (alternative to printing)
 */
export async function shareSheetPDF(data: SheetPrintData): Promise<string | null> {
	const html = generateSheetHTML(data);

	try {
		const pdf = await Print.printToFileAsync({
			html,
			base64: false,
		});

		console.log('PDF saved to:', pdf.uri);
		return pdf.uri;
	} catch (error) {
		console.error('Error generating PDF:', error);
		throw error;
	}
}
