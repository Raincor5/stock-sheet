import React from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import type { Database } from '@/types/supabase';

type TemplateColumn = {
	id: string;
	label: string;
	order?: number;
	fieldType?: 'number' | 'text' | 'boolean';
};
type Product = Database['public']['Tables']['products']['Row'];

const ENTRY_KEY_SEPARATOR = '::';

function buildEntryKey(productId: string, columnId: string) {
	return `${productId}${ENTRY_KEY_SEPARATOR}${columnId}`;
}

interface SheetDataGridProps {
	columns: TemplateColumn[];
	products: Product[];
	values: Record<string, string | null>;
	onValueChange: (productId: string, columnId: string, value: string) => void;
	isLocked?: boolean;
	horizontal?: boolean;
}

export const SheetDataGrid: React.FC<SheetDataGridProps> = ({
	columns,
	products,
	values,
	onValueChange,
	isLocked = false,
	horizontal = true,
}) => {
	const formatCellValue = (value: string | null | undefined) => value ?? '';
	const getNextBooleanValue = (value: string | null | undefined) => {
		const normalizedValue = (value ?? '').trim().toLowerCase();
		if (!normalizedValue) return 'Yes';
		if (normalizedValue === 'yes' || normalizedValue === 'true') return 'No';
		return '';
	};

	const GridContent = () => (
		<View>
			{/* Column Headers */}
			<View style={styles.headerRow}>
				<View style={[styles.cell, styles.productNameCell]}>
					<Text style={styles.headerCellText}>Product</Text>
				</View>
				{columns.map((col) => (
					<View
						key={col.id}
						style={[
							styles.cell,
							styles.dataCell,
							col.fieldType === 'text' && styles.textDataCell,
							col.fieldType === 'boolean' && styles.booleanDataCell,
						]}
					>
						<Text style={styles.headerCellText}>{col.label}</Text>
					</View>
				))}
			</View>

			{/* Product Rows */}
			{products.map((product) => (
				<View key={product.id} style={styles.dataRow}>
					<View style={[styles.cell, styles.productNameCell]}>
						<Text style={styles.productNameText}>{product.name}</Text>
					</View>
					{columns.map((col) => {
						const key = buildEntryKey(product.id, col.id);
						const value = values[key];
						const isDisabled = isLocked;
						const isTextField = col.fieldType === 'text';
						const isBooleanField = col.fieldType === 'boolean';

						return (
							<View
								key={col.id}
								style={[
									styles.cell,
									styles.dataCell,
									isTextField && styles.textDataCell,
									isBooleanField && styles.booleanDataCell,
								]}
							>
								{isBooleanField ? (
									<TouchableOpacity
										style={[
											styles.booleanFieldButton,
											!value && styles.booleanFieldButtonEmpty,
											isDisabled && styles.disabledInput,
										]}
										onPress={() =>
											!isDisabled &&
											onValueChange(product.id, col.id, getNextBooleanValue(value))
										}
										disabled={isDisabled}
									>
										<Text
											style={[
												styles.booleanFieldText,
												!value && styles.booleanFieldPlaceholder,
											]}
										>
											{value && value.trim().length > 0 ? value : 'Tap'}
										</Text>
									</TouchableOpacity>
								) : (
									<TextInput
										style={[
											styles.cellInput,
											isTextField && styles.textInput,
											isDisabled && styles.disabledInput,
										]}
										keyboardType={isTextField ? 'default' : 'decimal-pad'}
										placeholder={isTextField ? 'Text' : '0'}
										value={formatCellValue(value)}
										onChangeText={(text) =>
											onValueChange(product.id, col.id, text)
										}
										editable={!isDisabled}
										autoCapitalize={isTextField ? 'sentences' : 'none'}
										autoCorrect={isTextField}
									/>
								)}
							</View>
						);
					})}
				</View>
			))}
		</View>
	);

	if (horizontal) {
		return (
			<ScrollView
				style={styles.gridContainer}
				horizontal
				scrollEventThrottle={16}
			>
				<GridContent />
			</ScrollView>
		);
	}

	return (
		<View style={styles.gridContainer}>
			<GridContent />
		</View>
	);
};

const styles = StyleSheet.create({
	gridContainer: {
		flex: 1,
		backgroundColor: '#fff',
	},
	headerRow: {
		flexDirection: 'row',
		backgroundColor: '#f0f0f0',
		borderBottomWidth: 2,
		borderBottomColor: '#d0d0d0',
	},
	dataRow: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#e0e0e0',
	},
	cell: {
		borderRightWidth: 1,
		borderRightColor: '#e0e0e0',
		justifyContent: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	productNameCell: {
		width: 150,
		backgroundColor: '#fafafa',
	},
	dataCell: {
		width: 100,
		alignItems: 'center',
	},
	textDataCell: {
		width: 180,
		alignItems: 'stretch',
	},
	booleanDataCell: {
		width: 110,
	},
	headerCellText: {
		fontSize: 13,
		fontWeight: '600',
		color: '#333',
		textAlign: 'center',
	},
	productNameText: {
		fontSize: 14,
		fontWeight: '500',
		color: '#333',
	},
	cellInput: {
		width: 80,
		height: 36,
		borderWidth: 1,
		borderColor: '#ddd',
		borderRadius: 4,
		paddingHorizontal: 8,
		fontSize: 14,
		textAlign: 'center',
		backgroundColor: '#fff',
	},
	textInput: {
		width: '100%',
		textAlign: 'left',
	},
	booleanFieldButton: {
		width: '100%',
		height: 36,
		borderWidth: 1,
		borderColor: '#ddd',
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#fff',
	},
	booleanFieldButtonEmpty: {
		borderStyle: 'dashed',
	},
	booleanFieldText: {
		fontSize: 14,
		fontWeight: '600',
		color: '#1f2937',
	},
	booleanFieldPlaceholder: {
		color: '#9ca3af',
		fontWeight: '500',
	},
	disabledInput: {
		backgroundColor: '#f5f5f5',
		color: '#999',
	},
});
