import { useMemo } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useStoreMembership, useTemplateRoleOverrides } from '@/hooks/useStores';
import { useCreateSheet, useSheetTemplates } from '@/hooks/useSheet';
import { useRequireRole } from '@/hooks/useRequireRole';
import {
	extractTemplateColumns,
	getUsableTemplates,
	type TemplateColumn,
} from '@/lib/api/sheetTemplates';
import { filterTemplatesByPermission } from '@/lib/documentAccess';
import type { Database } from '@/types/supabase';

type SheetTemplate = Database['public']['Tables']['sheet_templates']['Row'];

export default function CreateSheetScreen() {
	useRequireRole('staff');

	const { storeId: authStoreId, user } = useAuth();
	const { storeId: storeIdParam } = useLocalSearchParams<{ storeId?: string }>();
	const router = useRouter();
	const activeStoreId = typeof storeIdParam === 'string' ? storeIdParam : authStoreId;
	const {
		data: activeStoreMembership,
		isLoading: isMembershipLoading,
	} = useStoreMembership(activeStoreId, user?.id ?? null);
	const { data: templates, isLoading: templatesLoading } = useSheetTemplates(activeStoreId);
	const {
		data: templateOverrides,
		isLoading: isOverridesLoading,
	} = useTemplateRoleOverrides(activeStoreId);
	const createSheet = useCreateSheet();
	const canManageTemplates = Boolean(activeStoreMembership?.permissions.manageTemplates);
	const isPermissionContextLoading = isMembershipLoading || isOverridesLoading;

	const usableTemplates = useMemo(() => getUsableTemplates(templates), [templates]);
	const creatableTemplates = useMemo(
		() =>
			filterTemplatesByPermission(
				usableTemplates,
				activeStoreMembership ?? null,
				templateOverrides ?? [],
				'createDocuments'
			),
		[activeStoreMembership, templateOverrides, usableTemplates]
	);

	const goToTemplateScan = (template?: SheetTemplate) => {
		if (!activeStoreId || !canManageTemplates) return;

		router.push({
			pathname: '/sheet-scan',
			params: {
				storeId: activeStoreId,
				templateId: template?.id,
				templateName: template?.name ?? 'Unnamed Template',
			},
		});
	};

	const handleCreateSheet = async (templateId: string) => {
		if (!activeStoreId) return;

		const sheet = await createSheet.mutateAsync({
			storeId: activeStoreId,
			templateId,
		});
		router.replace(`/sheet/${sheet.id}`);
	};

	const renderTemplateCard = (template: SheetTemplate) => {
		const fields = extractTemplateColumns(template);

		return (
			<View key={template.id} style={styles.templateCard}>
				<View style={styles.templateHeader}>
					<View style={styles.templateHeaderCopy}>
						<Text style={styles.templateName}>{template.name || 'Unnamed Template'}</Text>
						<Text style={styles.templateMeta}>
							{fields.length} field{fields.length !== 1 ? 's' : ''}:
							{' '}
							{fields
								.slice(0, 3)
								.map((field: TemplateColumn) => field.label)
								.join(', ')}
							{fields.length > 3 ? '...' : ''}
						</Text>
					</View>
				</View>

				<View style={styles.templateActions}>
					<TouchableOpacity
						style={[
							styles.primaryButton,
							createSheet.isPending && styles.buttonDisabled,
						]}
						onPress={() => handleCreateSheet(template.id)}
						disabled={createSheet.isPending}
					>
						{createSheet.isPending ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.primaryButtonText}>Create New Sheet</Text>
						)}
					</TouchableOpacity>

					{canManageTemplates ? (
						<TouchableOpacity
							style={styles.secondaryButton}
							onPress={() => goToTemplateScan(template)}
						>
							<Text style={styles.secondaryButtonText}>Update Template</Text>
						</TouchableOpacity>
					) : null}
				</View>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={styles.content}>
				<Text style={styles.title}>Create Sheet</Text>
				<Text style={styles.subtitle}>
					Choose a reusable template, then create a fresh sheet instance from it.
				</Text>

				{!activeStoreId ? (
					<Text style={styles.notice}>Create or join a store first.</Text>
				) : templatesLoading || isPermissionContextLoading ? (
					<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
				) : usableTemplates.length === 0 ? (
					<>
						<Text style={styles.notice}>
							This store does not have any reusable templates yet.
						</Text>
						<Text style={styles.helperText}>
							Templates can represent stock counts, temperature checks, cleaning logs, or any other repeatable sheet type.
						</Text>
						{canManageTemplates ? (
							<TouchableOpacity
								style={styles.secondaryButton}
								onPress={() => goToTemplateScan()}
							>
								<Text style={styles.secondaryButtonText}>Create Template From Photo</Text>
							</TouchableOpacity>
						) : (
							<Text style={styles.helperText}>
								Someone with template-management access needs to create a reusable template before you can create sheets from it.
							</Text>
						)}
					</>
				) : creatableTemplates.length === 0 ? (
					<>
						<Text style={styles.notice}>
							Templates exist for this store, but your role is not allowed to create documents from them yet.
						</Text>
						{canManageTemplates ? (
							<TouchableOpacity
								style={styles.secondaryButton}
								onPress={() => goToTemplateScan()}
							>
								<Text style={styles.secondaryButtonText}>Create Template From Photo</Text>
							</TouchableOpacity>
						) : null}
					</>
				) : (
					<>
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Reusable Templates</Text>
							{creatableTemplates.map(renderTemplateCard)}
						</View>

						{canManageTemplates ? (
							<View style={styles.section}>
								<Text style={styles.sectionTitle}>New Template</Text>
								<TouchableOpacity
									style={styles.secondaryButton}
									onPress={() => goToTemplateScan()}
								>
									<Text style={styles.secondaryButtonText}>Create Template From Photo</Text>
								</TouchableOpacity>
							</View>
						) : null}
					</>
				)}

				<TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
					<Text style={styles.linkButtonText}>Back</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	content: {
		padding: 20,
		paddingBottom: 32,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#1c1c1e',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: '#6b7280',
		marginBottom: 24,
		lineHeight: 22,
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
		marginBottom: 12,
	},
	notice: {
		fontSize: 15,
		color: '#111827',
		marginBottom: 16,
		lineHeight: 22,
	},
	helperText: {
		fontSize: 14,
		color: '#6b7280',
		lineHeight: 20,
		marginBottom: 16,
	},
	loader: {
		marginVertical: 24,
	},
	templateCard: {
		backgroundColor: '#fff',
		borderRadius: 14,
		padding: 16,
		marginBottom: 14,
		borderWidth: 1,
		borderColor: '#e5e7eb',
	},
	templateHeader: {
		marginBottom: 14,
	},
	templateHeaderCopy: {
		gap: 6,
	},
	templateName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
	},
	templateMeta: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6b7280',
	},
	templateActions: {
		gap: 10,
	},
	primaryButton: {
		backgroundColor: '#007AFF',
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: 'center',
	},
	primaryButtonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	secondaryButton: {
		backgroundColor: '#fff',
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#007AFF',
	},
	secondaryButtonText: {
		color: '#007AFF',
		fontSize: 16,
		fontWeight: '600',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	linkButton: {
		marginTop: 8,
		alignItems: 'center',
	},
	linkButtonText: {
		color: '#007AFF',
		fontSize: 15,
		fontWeight: '600',
	},
});
