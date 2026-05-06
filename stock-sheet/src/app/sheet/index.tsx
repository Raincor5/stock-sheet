import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import {
	useMyStores,
	useStoreMembership,
	useTemplateRoleOverrides,
} from '@/hooks/useStores';
import { useSheetTemplates } from '@/hooks/useSheet';
import { getStockSheets } from '@/db/stock-sheets';
import { getUsableTemplates } from '@/lib/api/sheetTemplates';
import {
	filterSheetsByPermission,
	filterTemplatesByPermission,
} from '@/lib/documentAccess';
import type { Database } from '@/types/supabase';

type StockSheet = Database['public']['Tables']['sheet_instances']['Row'];

export default function SheetScreen() {
	useRequireRole('staff');

	const { user, signOut, role, session, storeId } = useAuth();
	const { data: stores, isLoading, error } = useMyStores();
	const router = useRouter();
	const [sheets, setSheets] = useState<StockSheet[]>([]);
	const [sheetsLoading, setSheetsLoading] = useState(false);
	const [selectedStoreId, setSelectedStoreId] = useState<string | null>(storeId || null);
	const {
		data: selectedStoreMembership,
		isLoading: isMembershipLoading,
	} = useStoreMembership(selectedStoreId, user?.id ?? null);
	const { data: templates, isLoading: templatesLoading } = useSheetTemplates(selectedStoreId);
	const {
		data: templateOverrides,
		isLoading: overridesLoading,
	} = useTemplateRoleOverrides(selectedStoreId);
	const isFocused = useIsFocused();

	const handleLogout = async () => {
		await signOut();
		router.replace('/login');
	};

	const goToAdmin = () => {
		router.push('/stores');
	};

	const goToCreateSheet = () => {
		if (!selectedStoreId) return;
		router.push({ pathname: '/sheet-create', params: { storeId: selectedStoreId } });
	};

	const goToScanTemplate = () => {
		if (!selectedStoreId) return;
		router.push({ pathname: '/sheet-scan', params: { storeId: selectedStoreId } });
	};

	const goToSheetDetail = (sheetId: string) => {
		router.push(`/sheet/${sheetId}`);
	};

	const loadSheets = async (storeIdToLoad: string) => {
		try {
			setSheetsLoading(true);
			const sheetsList = await getStockSheets(storeIdToLoad, {
				startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
				includeArchived: false,
			});
			setSheets(sheetsList);
		} catch (err) {
			console.error('Failed to load sheets:', err);
		} finally {
			setSheetsLoading(false);
		}
	};

	useEffect(() => {
		if (selectedStoreId && isFocused) {
			loadSheets(selectedStoreId);
		}
	}, [selectedStoreId, isFocused]);

	useEffect(() => {
		if (!selectedStoreId && stores && stores.length > 0) {
			setSelectedStoreId(storeId ?? stores[0].id);
		}
	}, [selectedStoreId, stores, storeId]);

	const canOpenSheet = Boolean(selectedStoreId);
	const usableTemplates = useMemo(() => getUsableTemplates(templates), [templates]);
	const creatableTemplates = useMemo(
		() =>
			filterTemplatesByPermission(
				usableTemplates,
				selectedStoreMembership ?? null,
				templateOverrides ?? [],
				'createDocuments'
			),
		[selectedStoreMembership, templateOverrides, usableTemplates]
	);
	const viewableSheets = useMemo(
		() =>
			filterSheetsByPermission(
				sheets,
				selectedStoreMembership ?? null,
				templateOverrides ?? [],
				'viewDocuments'
			),
		[selectedStoreMembership, sheets, templateOverrides]
	);
	const canManageTemplates = Boolean(selectedStoreMembership?.permissions.manageTemplates);
	const isPermissionContextLoading = isMembershipLoading || overridesLoading;
	const displayedRole =
		selectedStoreMembership?.store_role?.name ?? role ?? 'No store access yet';
	const templateNameById = useMemo(
		() =>
			new Map((templates ?? []).map((template) => [template.id, template.name || 'Unnamed Template'])),
		[templates]
	);

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<View>
					<Text style={styles.greeting}>Welcome, {user?.email}</Text>
					<Text style={styles.role}>Role: {displayedRole}</Text>
				</View>
				<TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
					<Text style={styles.logoutText}>Logout</Text>
				</TouchableOpacity>
			</View>

			<ScrollView style={styles.content}>
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Your Stores</Text>

					{isLoading ? (
						<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
					) : error ? (
						<Text style={styles.error}>Failed to load stores</Text>
					) : stores && stores.length > 0 ? (
						stores.map((item) => (
							<TouchableOpacity
								key={item.id}
								style={[
									styles.storeCard,
									selectedStoreId === item.id && styles.storeCardSelected,
								]}
								onPress={() => {
									setSelectedStoreId(item.id);
									setSheets([]);
								}}
								activeOpacity={0.8}
								accessibilityRole="button"
								accessibilityLabel={`Open store ${item.name}`}
							>
								<Text style={styles.storeName}>{item.name}</Text>
								<Text style={styles.storeSubtext}>
									{selectedStoreId === item.id
										? `${viewableSheets.length} recent sheet${viewableSheets.length !== 1 ? 's' : ''}`
										: 'Tap to load this store'}
								</Text>
							</TouchableOpacity>
						))
					) : (
						<Text style={styles.empty}>No stores yet. Create one to get started.</Text>
					)}
				</View>

				{selectedStoreId ? (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Templates</Text>

						<View style={styles.statusCard}>
							<Text style={styles.statusTitle}>
								{usableTemplates.length > 0
									? `${usableTemplates.length} reusable template${usableTemplates.length !== 1 ? 's' : ''} available`
									: 'No reusable templates yet'}
							</Text>
							<Text style={styles.statusBody}>
								{usableTemplates.length > 0
									? 'Create as many sheet instances as you need from any template, including stock counts, temperature checks, and other recurring forms.'
									: 'People with template-management access can create reusable templates from a photo, then employees can create fresh sheet instances from them whenever needed.'}
							</Text>
						</View>
					</View>
				) : null}

				{selectedStoreId && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Recent Sheets</Text>

						{sheetsLoading ? (
							<ActivityIndicator size="small" color="#007AFF" />
						) : viewableSheets.length > 0 ? (
							viewableSheets.map((item) => (
								<TouchableOpacity
									key={item.id}
									style={styles.sheetCard}
									onPress={() => goToSheetDetail(item.id)}
									activeOpacity={0.8}
									accessibilityRole="button"
									accessibilityLabel={`Open ${templateNameById.get(item.sheet_template_id) ?? 'sheet'} from ${new Date(item.date).toLocaleDateString()}`}
								>
									<View style={styles.sheetInfo}>
										<Text style={styles.sheetDate}>
											{templateNameById.get(item.sheet_template_id) ?? 'Unnamed Template'}
										</Text>
										<Text style={styles.sheetStatus}>
											{new Date(item.date).toLocaleDateString()}
											{' • '}
											{new Date(item.created_at).toLocaleTimeString([], {
												hour: 'numeric',
												minute: '2-digit',
											})}
											{' • '}
											{item.is_locked ? 'Locked' : 'Open'}
										</Text>
									</View>
									<Text style={styles.sheetArrow}>Open</Text>
								</TouchableOpacity>
							))
						) : (
							<Text style={styles.empty}>
								{sheets.length > 0
									? 'No recent sheets are visible to your role.'
									: 'No sheets yet for this period'}
							</Text>
						)}
					</View>
				)}

				<View style={styles.actions}>
					{session && (
						<TouchableOpacity
							style={styles.createButton}
							onPress={goToAdmin}
							accessibilityRole="button"
							accessibilityLabel="Open the admin panel"
						>
							<Text style={styles.createButtonText}>Admin Panel</Text>
						</TouchableOpacity>
					)}

					{session && (
						<TouchableOpacity
							style={[
								styles.secondaryButton,
								(!canOpenSheet ||
									isPermissionContextLoading ||
									creatableTemplates.length === 0) &&
									styles.buttonDisabled,
							]}
							onPress={goToCreateSheet}
							disabled={
								!canOpenSheet ||
								isPermissionContextLoading ||
								creatableTemplates.length === 0
							}
							accessibilityRole="button"
							accessibilityLabel="Choose a template and create a new sheet"
						>
							<Text style={styles.secondaryButtonText}>
								{isPermissionContextLoading ? 'Loading Access…' : 'Create Sheet'}
							</Text>
						</TouchableOpacity>
					)}
				</View>

				{canOpenSheet ? (
					<View style={styles.templateCard}>
						<Text style={styles.templateCardTitle}>Reusable Template</Text>
						<Text style={styles.templateCardBody}>
							Take a picture of a paper sheet or upload a saved photo to build the reusable template for this store.
						</Text>
						{templatesLoading ? (
							<ActivityIndicator size="small" color="#007AFF" style={styles.templateLoader} />
						) : isPermissionContextLoading ? (
							<ActivityIndicator size="small" color="#007AFF" style={styles.templateLoader} />
						) : canManageTemplates ? (
							<TouchableOpacity
								style={styles.scanButton}
								onPress={goToScanTemplate}
								accessibilityRole="button"
								accessibilityLabel="Take or upload a photo to create or update the reusable sheet template"
							>
								<Text style={styles.scanButtonText}>
									Create Template From Photo
								</Text>
							</TouchableOpacity>
						) : (
							<Text style={styles.templateHelper}>
								Someone with template-management access can create or update templates from a photo.
							</Text>
						)}
					</View>
				) : null}

				{session && !canOpenSheet ? (
					<Text style={styles.empty}>Select a store to create or open a sheet.</Text>
				) : null}
			</ScrollView>
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
		paddingHorizontal: 16,
		paddingVertical: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		borderBottomWidth: 1,
		borderBottomColor: '#e5e5ea',
	},
	greeting: {
		fontSize: 18,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	role: {
		fontSize: 12,
		color: '#8e8e93',
		marginTop: 4,
	},
	logoutButton: {
		backgroundColor: '#d70015',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 6,
	},
	logoutText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '600',
	},
	content: {
		flex: 1,
		padding: 16,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		marginBottom: 12,
		color: '#1c1c1e',
	},
	storeCard: {
		backgroundColor: '#fff',
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		borderLeftWidth: 4,
		borderLeftColor: '#007AFF',
	},
	storeName: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	storeLocation: {
		fontSize: 14,
		color: '#8e8e93',
		marginTop: 4,
	},
	loader: {
		marginVertical: 20,
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	error: {
		color: '#d70015',
		fontSize: 14,
		textAlign: 'center',
		marginVertical: 10,
	},
	empty: {
		color: '#8e8e93',
		fontSize: 14,
		textAlign: 'center',
		marginVertical: 10,
	},
	createButton: {
		backgroundColor: '#007AFF',
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		flex: 1,
	},
	createButtonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	actions: {
		flexDirection: 'row',
		gap: 12,
		marginVertical: 20,
	},
	secondaryButton: {
		backgroundColor: '#fff',
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		flex: 1,
		borderWidth: 1,
		borderColor: '#007AFF',
	},
	secondaryButtonText: {
		color: '#007AFF',
		fontSize: 16,
		fontWeight: '600',
	},
	scanButton: {
		backgroundColor: '#fff',
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#1c1c1e',
	},
	scanButtonText: {
		color: '#1c1c1e',
		fontSize: 16,
		fontWeight: '600',
	},
	storeCardSelected: {
		borderLeftColor: '#34C759',
		backgroundColor: '#f0f9ff',
	},
	storeSubtext: {
		fontSize: 12,
		color: '#8e8e93',
		marginTop: 4,
	},
	statusCard: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: '#dbeafe',
	},
	statusTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#1c1c1e',
	},
	statusBody: {
		fontSize: 14,
		lineHeight: 20,
		color: '#4b5563',
		marginTop: 8,
	},
	sheetCard: {
		backgroundColor: '#fff',
		borderRadius: 8,
		padding: 12,
		marginBottom: 8,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		borderLeftWidth: 4,
		borderLeftColor: '#007AFF',
	},
	sheetInfo: {
		flex: 1,
	},
	sheetDate: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	sheetStatus: {
		fontSize: 12,
		color: '#8e8e93',
		marginTop: 4,
	},
	sheetArrow: {
		fontSize: 14,
		color: '#007AFF',
		fontWeight: '600',
	},
	templateCard: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e5e7eb',
		marginBottom: 24,
	},
	templateCardTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#1c1c1e',
	},
	templateCardBody: {
		fontSize: 14,
		lineHeight: 20,
		color: '#4b5563',
		marginTop: 8,
		marginBottom: 12,
	},
	templateHelper: {
		fontSize: 14,
		lineHeight: 20,
		color: '#8e8e93',
	},
	templateLoader: {
		marginTop: 4,
	},
});
