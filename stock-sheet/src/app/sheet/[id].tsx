import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	TextInput,
	Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useArchiveSheet, useLockSheet, useUnlockSheet } from '@/hooks/useSheet';
import { useStoreMembership, useTemplateRoleOverrides } from '@/hooks/useStores';
import { SheetDataGrid } from '@/components/SheetDataGrid';
import { getStockSheetById } from '@/db/stock-sheets';
import { getSheetTemplateById } from '@/db/sheet-templates';
import { getProducts, createProduct } from '@/db/products';
import { getSheetEntries } from '@/db/sheet-entries';
import { getStoreById } from '@/db/stores';
import { batchSaveEntries } from '@/lib/api/sheets';
import { extractTemplateColumns, type TemplateColumn } from '@/lib/api/sheetTemplates';
import { getTemplatePermissions } from '@/lib/documentAccess';
import { hasPermission } from '@/lib/permissions';
import { printSheet } from '@/lib/print/sheet-printer';
import type { Database } from '@/types/supabase';

type StockSheet = Database['public']['Tables']['sheet_instances']['Row'];
type SheetTemplate = Database['public']['Tables']['sheet_templates']['Row'];
type SheetEntry = Database['public']['Tables']['sheet_entries']['Row'];
type Product = Database['public']['Tables']['products']['Row'];
type SheetEntryInsert = Database['public']['Tables']['sheet_entries']['Insert'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];

const ENTRY_KEY_SEPARATOR = '::';

function buildEntryKey(productId: string, columnId: string) {
	return `${productId}${ENTRY_KEY_SEPARATOR}${columnId}`;
}

function parseEntryKey(key: string) {
	const separatorIndex = key.indexOf(ENTRY_KEY_SEPARATOR);
	if (separatorIndex === -1) {
		return null;
	}

	return {
		productId: key.slice(0, separatorIndex),
		columnId: key.slice(separatorIndex + ENTRY_KEY_SEPARATOR.length),
	};
}

export default function SheetDetailScreen() {
	useRequireRole('staff');

	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { user } = useAuth();
	const lockSheetMutation = useLockSheet();
	const unlockSheetMutation = useUnlockSheet();
	const archiveSheetMutation = useArchiveSheet();

	const [sheet, setSheet] = useState<StockSheet | null>(null);
	const [template, setTemplate] = useState<SheetTemplate | null>(null);
	const [products, setProducts] = useState<Product[]>([]);
	const [entries, setEntries] = useState<SheetEntry[]>([]);
	const [editedValues, setEditedValues] = useState<Record<string, string | null>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [printing, setPrinting] = useState(false);
	const [error, setError] = useState('');
	const [storeName, setStoreName] = useState('');
	const [showAddProductModal, setShowAddProductModal] = useState(false);
	const [newProductName, setNewProductName] = useState('');
	const { data: storeMembership, isLoading: isMembershipLoading } = useStoreMembership(
		sheet?.store_id ?? null,
		user?.id ?? null
	);
	const {
		data: templateOverrides,
		isLoading: isOverridesLoading,
	} = useTemplateRoleOverrides(sheet?.store_id ?? null);

	React.useEffect(() => {
		loadSheetData();
	}, [id]);

	const loadSheetData = async () => {
		try {
			setError('');
			setLoading(true);

			if (!id) {
				setError('Sheet ID is missing');
				return;
			}

			const sheetData = await getStockSheetById(id);
			if (!sheetData) {
				setError('Sheet not found');
				return;
			}
			setSheet(sheetData);

			const store = await getStoreById(sheetData.store_id);
			if (store) {
				setStoreName(store.name);
			}

			const templateData = await getSheetTemplateById(sheetData.sheet_template_id);
			if (templateData) {
				setTemplate(templateData);
			}

			const productsData = await getProducts(sheetData.store_id);
			setProducts(productsData);

			const entriesData = await getSheetEntries(id);
			setEntries(entriesData);

			const initialValues: Record<string, string | null> = {};
			entriesData.forEach((entry) => {
				const key = buildEntryKey(entry.product_id, entry.column_id);
				if (entry.value === 'true') {
					initialValues[key] = 'Yes';
					return;
				}

				if (entry.value === 'false') {
					initialValues[key] = 'No';
					return;
				}

				initialValues[key] = entry.value ?? null;
			});
			setEditedValues(initialValues);
		} catch (err: any) {
			console.error('Error loading sheet data:', err);
			setError(err?.message || 'Failed to load sheet data');
		} finally {
			setLoading(false);
		}
	};

	const getColumns = (): TemplateColumn[] => {
		return extractTemplateColumns(template);
	};

	const templatePermissions = React.useMemo(() => {
		return getTemplatePermissions(
			sheet?.sheet_template_id ?? '',
			storeMembership ?? null,
			templateOverrides ?? []
		);
	}, [sheet?.sheet_template_id, storeMembership, templateOverrides]);

	const handleValueChange = (productId: string, columnId: string, value: string) => {
		const key = buildEntryKey(productId, columnId);
		setEditedValues((prev) => ({
			...prev,
			[key]: value,
		}));
	};

	const handleSave = async () => {
		if (!id || !hasPermission(templatePermissions, 'editDocuments') || sheet?.is_locked) return;

		try {
			setSaving(true);
			setError('');

			const entriesToSave: SheetEntryInsert[] = [];
			const columnsById = new Map(getColumns().map((column) => [column.id, column]));

			for (const [key, value] of Object.entries(editedValues)) {
				if (value === null) {
					continue;
				}

				const parsedKey = parseEntryKey(key);
				if (!parsedKey) {
					continue;
				}

				const column = columnsById.get(parsedKey.columnId);
				const normalizedValue = value.trim();

				if (!normalizedValue) {
					continue;
				}

				if (column?.fieldType === 'number' && !/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) {
					Alert.alert(
						'Invalid Number',
						`"${column.label}" only accepts numeric values.`
					);
					return;
				}

				if (
					column?.fieldType === 'boolean' &&
					!['yes', 'no', 'true', 'false'].includes(normalizedValue.toLowerCase())
				) {
					Alert.alert(
						'Invalid Yes / No',
						`"${column.label}" only accepts yes/no values.`
					);
					return;
				}

				entriesToSave.push({
					sheet_id: id,
					product_id: parsedKey.productId,
					column_id: parsedKey.columnId,
					value:
						column?.fieldType === 'boolean'
							? normalizedValue.toLowerCase() === 'yes' || normalizedValue.toLowerCase() === 'true'
								? 'Yes'
								: 'No'
							: normalizedValue,
				});
			}

			if (entriesToSave.length > 0) {
				await batchSaveEntries(entriesToSave);
			}

			Alert.alert('Success', 'Sheet data saved successfully');
			await loadSheetData();
		} catch (err: any) {
			console.error('Error saving sheet:', err);
			setError(err?.message || 'Failed to save sheet');
		} finally {
			setSaving(false);
		}
	};

	const handlePrint = async () => {
		if (!sheet || !storeName) {
			Alert.alert('Error', 'Sheet or store information missing');
			return;
		}

		try {
			setPrinting(true);
			setError('');

			await printSheet({
				storeId: sheet.store_id,
				storeName,
				sheetDate: sheet.date,
				columns: getColumns(),
				products,
				entries,
				values: editedValues,
			});

			Alert.alert('Success', 'Sheet sent to printer');
		} catch (err: any) {
			console.error('Error printing sheet:', err);
			Alert.alert('Error', err?.message || 'Failed to print sheet');
		} finally {
			setPrinting(false);
		}
	};

	const handleAddProduct = async () => {
		if (!newProductName.trim() || !sheet?.store_id) {
			Alert.alert('Error', 'Product name is required');
			return;
		}

		const normalizedName = newProductName.trim().replace(/\s+/g, ' ');
		const alreadyExists = products.some(
			(product) =>
				product.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedName.toLowerCase()
		);

		if (alreadyExists) {
			Alert.alert('Duplicate Product', 'That product already exists for this store.');
			return;
		}

		try {
			const productData: ProductInsert = {
				store_id: sheet.store_id,
				name: normalizedName,
			};

			const newProduct = await createProduct(productData);
			setProducts([...products, newProduct]);
			setNewProductName('');
			setShowAddProductModal(false);
			Alert.alert('Success', `Product "${newProduct.name}" added`);
		} catch (err: any) {
			console.error('Error creating product:', err);
			Alert.alert('Error', err?.message || 'Failed to add product');
		}
	};

	const handleToggleLock = async () => {
		if (!sheet || !hasPermission(templatePermissions, 'lockDocuments')) return;

		try {
			setError('');
			if (sheet.is_locked) {
				await unlockSheetMutation.mutateAsync(sheet.id);
			} else {
				await lockSheetMutation.mutateAsync(sheet.id);
			}
			await loadSheetData();
		} catch (err: any) {
			setError(err?.message || 'Failed to update the sheet status');
		}
	};

	const handleArchiveSheet = () => {
		if (!sheet || !hasPermission(templatePermissions, 'archiveDocuments')) return;

		Alert.alert(
			'Archive Sheet',
			'This will remove the sheet from the main list.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Archive',
					style: 'destructive',
					onPress: async () => {
						try {
							setError('');
							await archiveSheetMutation.mutateAsync(sheet.id);
							router.replace('/sheet');
						} catch (err: any) {
							setError(err?.message || 'Failed to archive the sheet');
						}
					},
				},
			]
		);
	};

	if (loading) {
		return (
			<SafeAreaView style={styles.container}>
				<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
			</SafeAreaView>
		);
	}

	if (sheet && (isMembershipLoading || isOverridesLoading || !storeMembership)) {
		return (
			<SafeAreaView style={styles.container}>
				<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
			</SafeAreaView>
		);
	}

	const columns = getColumns();
	const canViewSheet = hasPermission(templatePermissions, 'viewDocuments');
	const canEditSheet = hasPermission(templatePermissions, 'editDocuments') && !sheet?.is_locked;
	const canAddProducts = Boolean(sheet && canEditSheet);
	const canManageLockState = hasPermission(templatePermissions, 'lockDocuments');
	const canArchiveSheet = hasPermission(templatePermissions, 'archiveDocuments');
	const canManageSheet = canManageLockState || canArchiveSheet;
	const isSheetActionPending =
		lockSheetMutation.isPending ||
		unlockSheetMutation.isPending ||
		archiveSheetMutation.isPending;

	if (!canViewSheet) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyTitle}>Access Restricted</Text>
					<Text style={styles.emptyText}>
						Your current role does not have access to this document.
					</Text>
					<TouchableOpacity style={styles.addProductButton} onPress={() => router.replace('/sheet')}>
						<Text style={styles.addProductButtonText}>Back to Sheets</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>
					{template?.name ?? 'Sheet'}
				</Text>
				<View style={styles.headerBadges}>
					<Text style={styles.headerDate}>{sheet ? new Date(sheet.date).toLocaleDateString() : ''}</Text>
					{sheet?.is_locked && <Text style={styles.lockedBadge}>Locked</Text>}
				</View>
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			{canManageSheet ? (
				<View style={styles.managerActions}>
					{canManageLockState ? (
						<TouchableOpacity
							style={[styles.managerActionButton, isSheetActionPending && styles.buttonDisabled]}
							onPress={handleToggleLock}
							disabled={isSheetActionPending}
						>
							<Text style={styles.managerActionText}>
								{sheet?.is_locked ? 'Unlock Sheet' : 'Lock Sheet'}
							</Text>
						</TouchableOpacity>
					) : null}

					{canArchiveSheet ? (
						<TouchableOpacity
							style={[
								styles.managerActionButton,
								styles.archiveActionButton,
								isSheetActionPending && styles.buttonDisabled,
							]}
							onPress={handleArchiveSheet}
							disabled={isSheetActionPending}
						>
							<Text style={styles.archiveActionText}>Archive Sheet</Text>
						</TouchableOpacity>
					) : null}
				</View>
			) : null}

			{products.length === 0 ? (
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyTitle}>No Products Yet</Text>
					<Text style={styles.emptyText}>
						{canAddProducts
							? 'Add products to this sheet to start entering sheet data.'
							: sheet?.is_locked
								? 'This sheet is locked, so products can no longer be added.'
								: 'Your role can view this document, but cannot edit it.'}
					</Text>
					{canAddProducts ? (
						<TouchableOpacity
							style={styles.addProductButton}
							onPress={() => setShowAddProductModal(true)}
						>
							<Text style={styles.addProductButtonText}>+ Add Product</Text>
						</TouchableOpacity>
					) : null}
				</View>
			) : (
				<>
					{canAddProducts && products.length > 0 ? (
						<TouchableOpacity
							style={styles.addProductButtonSmall}
							onPress={() => setShowAddProductModal(true)}
						>
							<Text style={styles.addProductButtonTextSmall}>+ Add Product</Text>
						</TouchableOpacity>
					) : null}
					<SheetDataGrid
						columns={columns}
						products={products}
						values={editedValues}
						onValueChange={handleValueChange}
						isLocked={!canEditSheet}
						horizontal
					/>
				</>
			)}

			<View style={styles.footer}>
				<TouchableOpacity
					style={[styles.button, styles.cancelButton]}
					onPress={() => router.back()}
				>
					<Text style={styles.cancelButtonText}>Back</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.button, styles.printButton, printing && styles.buttonDisabled]}
					onPress={handlePrint}
					disabled={printing || products.length === 0}
				>
					{printing ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.printButtonText}>Print</Text>
					)}
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.button,
						styles.saveButton,
						(saving || !canEditSheet) && styles.buttonDisabled,
					]}
					onPress={handleSave}
					disabled={saving || !canEditSheet || products.length === 0}
				>
					{saving ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.saveButtonText}>
							{sheet?.is_locked ? 'Locked' : canEditSheet ? 'Save' : 'Read Only'}
						</Text>
					)}
				</TouchableOpacity>
			</View>

			<Modal
				visible={canAddProducts ? showAddProductModal : false}
				transparent
				animationType="fade"
				onRequestClose={() => setShowAddProductModal(false)}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Add Product</Text>
						<TextInput
							style={styles.modalInput}
							placeholder="Product name"
							value={newProductName}
							onChangeText={setNewProductName}
							placeholderTextColor="#999"
						/>
						<View style={styles.modalButtons}>
							<TouchableOpacity
								style={[styles.modalButton, styles.modalCancelButton]}
								onPress={() => {
									setNewProductName('');
									setShowAddProductModal(false);
								}}
							>
								<Text style={styles.modalCancelButtonText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.modalButton, styles.modalAddButton]}
								onPress={handleAddProduct}
							>
								<Text style={styles.modalAddButtonText}>Add</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	header: {
		backgroundColor: '#fff',
		borderBottomWidth: 1,
		borderBottomColor: '#e0e0e0',
		paddingHorizontal: 16,
		paddingVertical: 12,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	title: {
		fontSize: 18,
		fontWeight: '600',
		color: '#000',
	},
	headerBadges: {
		alignItems: 'flex-end',
		gap: 6,
	},
	headerDate: {
		fontSize: 13,
		color: '#6b7280',
	},
	lockedBadge: {
		backgroundColor: '#ffcc00',
		color: '#000',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 4,
		fontSize: 12,
		fontWeight: '600',
	},
	error: {
		color: '#d32f2f',
		backgroundColor: '#ffebee',
		paddingHorizontal: 16,
		paddingVertical: 8,
		marginHorizontal: 16,
		marginTop: 8,
		borderRadius: 4,
		fontSize: 14,
	},
	loader: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	managerActions: {
		flexDirection: 'row',
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 8,
	},
	managerActionButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 8,
		alignItems: 'center',
		backgroundColor: '#fff',
		borderWidth: 1,
		borderColor: '#007AFF',
	},
	managerActionText: {
		color: '#007AFF',
		fontSize: 14,
		fontWeight: '600',
	},
	archiveActionButton: {
		borderColor: '#d70015',
	},
	archiveActionText: {
		color: '#d70015',
		fontSize: 14,
		fontWeight: '600',
	},
	footer: {
		flexDirection: 'row',
		backgroundColor: '#fff',
		borderTopWidth: 1,
		borderTopColor: '#e0e0e0',
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 8,
	},
	button: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cancelButton: {
		backgroundColor: '#f0f0f0',
	},
	cancelButtonText: {
		color: '#333',
		fontSize: 14,
		fontWeight: '600',
	},
	printButton: {
		backgroundColor: '#FF9500',
	},
	printButtonText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '600',
	},
	saveButton: {
		backgroundColor: '#007AFF',
	},
	saveButtonText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '600',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#fff',
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	emptyText: {
		fontSize: 14,
		color: '#999',
		textAlign: 'center',
		marginBottom: 20,
		paddingHorizontal: 20,
	},
	addProductButton: {
		backgroundColor: '#007AFF',
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
	},
	addProductButtonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	addProductButtonSmall: {
		backgroundColor: '#f0f0f0',
		marginHorizontal: 16,
		marginVertical: 8,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 6,
		alignSelf: 'flex-start',
	},
	addProductButtonTextSmall: {
		color: '#007AFF',
		fontSize: 14,
		fontWeight: '600',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalContent: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 20,
		width: '80%',
		maxWidth: 300,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: '600',
		marginBottom: 16,
		color: '#000',
	},
	modalInput: {
		borderWidth: 1,
		borderColor: '#ddd',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 16,
		fontSize: 14,
		color: '#000',
	},
	modalButtons: {
		flexDirection: 'row',
		gap: 12,
	},
	modalButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 8,
		alignItems: 'center',
	},
	modalCancelButton: {
		backgroundColor: '#f0f0f0',
	},
	modalCancelButtonText: {
		color: '#333',
		fontSize: 14,
		fontWeight: '600',
	},
	modalAddButton: {
		backgroundColor: '#007AFF',
	},
	modalAddButtonText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '600',
	},
});
