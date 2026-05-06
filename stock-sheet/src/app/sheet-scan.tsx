import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAnalyseSheet } from '@/hooks/useAnalyseSheet';
import { useRequireStorePermission } from '@/hooks/useRequireRole';
import { useSaveAnalysisAsTemplate } from '@/hooks/useSheet';
import type { SheetAnalysisResult } from '@/lib/ai/types';
import {
	normalizeTemplateName,
	sanitizeTemplateColumns,
	type TemplateColumn,
} from '@/lib/api/sheetTemplates';

export default function SheetScanScreen() {
	const { storeId: authStoreId } = useAuth();
	const { storeId: storeIdParam, templateId: templateIdParam, templateName: templateNameParam } =
		useLocalSearchParams<{ storeId?: string; templateId?: string; templateName?: string }>();
	const router = useRouter();
	const activeStoreId = typeof storeIdParam === 'string' ? storeIdParam : authStoreId;
	const activeTemplateId = typeof templateIdParam === 'string' ? templateIdParam : null;
	useRequireStorePermission(activeStoreId, 'manageTemplates');
	const analyseSheet = useAnalyseSheet();
	const saveTemplate = useSaveAnalysisAsTemplate();
	const [imageUri, setImageUri] = useState<string | null>(null);
	const [analysis, setAnalysis] = useState<SheetAnalysisResult | null>(null);
	const [detectedColumns, setDetectedColumns] = useState<TemplateColumn[]>([]);
	const [templateName, setTemplateName] = useState(
		typeof templateNameParam === 'string' ? normalizeTemplateName(templateNameParam) : ''
	);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const cycleFieldType = (fieldType: TemplateColumn['fieldType']): TemplateColumn['fieldType'] => {
		if (fieldType === 'number') return 'text';
		if (fieldType === 'text') return 'boolean';
		return 'number';
	};

	const pickImage = async (source: 'camera' | 'library') => {
		setError('');
		setSuccess('');
		setAnalysis(null);
		setDetectedColumns([]);

		if (source === 'camera') {
			const { granted } = await ImagePicker.requestCameraPermissionsAsync();
			if (!granted) {
				setError('Camera permission is required to take photos. Please enable it in Settings.');
				return;
			}
		} else {
			const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (!granted) {
				setError('Photo library permission is required to choose photos. Please enable it in Settings.');
				return;
			}
		}

		const result =
			source === 'camera'
				? await ImagePicker.launchCameraAsync({
					quality: 0.8,
					base64: true,
				})
				: await ImagePicker.launchImageLibraryAsync({
					mediaTypes: ['images'],
					quality: 0.8,
					base64: true,
				});

		if (result.canceled || !result.assets?.[0]) {
			return;
		}

		const asset = result.assets[0];
		if (!asset.base64) {
			setError('Could not read the selected image. Try another photo.');
			return;
		}

		setImageUri(asset.uri);

		try {
			let base64 = asset.base64;
			let mimeType = asset.mimeType ?? 'image/jpeg';

			if (mimeType === 'image/heic' || mimeType === 'image/heif') {
				const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], {
					compress: 0.8,
					format: ImageManipulator.SaveFormat.JPEG,
					base64: true,
				});

				if (manipulated.base64) {
					base64 = manipulated.base64;
					mimeType = 'image/jpeg';
				}
			}

			const resultData = await analyseSheet.mutateAsync({
				imageBase64: base64,
				mimeType,
			});
			setAnalysis(resultData);
			setDetectedColumns(sanitizeTemplateColumns(resultData.columns));
			if (!activeTemplateId) {
				setTemplateName(normalizeTemplateName(resultData.sheetTitle));
			}
		} catch (analysisError: any) {
			setError(analysisError?.message ?? 'Failed to analyse the image.');
		}
	};

	const toggleColumnFieldType = (columnId: string) => {
		setDetectedColumns((prev) =>
			prev.map((column) =>
				column.id === columnId
					? { ...column, fieldType: cycleFieldType(column.fieldType) }
					: column
			)
		);
	};

	const handleSaveTemplate = async () => {
		if (!activeStoreId || !analysis) return;

		setError('');
		setSuccess('');

		try {
			const sanitizedColumns = detectedColumns.length > 0
				? detectedColumns
				: sanitizeTemplateColumns(analysis.columns);
			if (sanitizedColumns.length === 0) {
				setError('No reusable columns were detected. Retake or upload a clearer sheet photo before saving.');
				return;
			}

			if (!templateName.trim()) {
				setError('Template name is required.');
				return;
			}

			await saveTemplate.mutateAsync({
				storeId: activeStoreId,
				analysis: {
					...analysis,
					columns: sanitizedColumns.map((column) => ({
						label: column.label,
						fieldType: column.fieldType,
					})),
				},
				templateId: activeTemplateId,
				templateName: templateName.trim(),
			});
			setSuccess('Template saved successfully.');
			router.replace({ pathname: '/sheet-create', params: { storeId: activeStoreId } });
		} catch (saveError: any) {
			setError(saveError?.message ?? 'Failed to save template.');
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Scan Template</Text>
				<Text style={styles.subtitle}>Take a photo or upload an existing sheet image, let AI read it, then save the reusable template columns.</Text>
			</View>

			<ScrollView contentContainerStyle={styles.content}>
				{error ? <Text style={styles.error}>{error}</Text> : null}
				{success ? <Text style={styles.success}>{success}</Text> : null}

				<View style={styles.actions}>
					<TouchableOpacity
						style={styles.button}
						onPress={() => pickImage('camera')}
						accessibilityRole="button"
						accessibilityLabel="Take a photo of a paper sheet"
					>
						<Text style={styles.buttonText}>Take Photo</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={() => pickImage('library')}
						accessibilityRole="button"
						accessibilityLabel="Upload a photo of a paper sheet"
					>
						<Text style={styles.secondaryButtonText}>Upload Photo</Text>
					</TouchableOpacity>
				</View>

				{analyseSheet.isPending ? (
					<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
				) : null}

				{imageUri ? (
					<View style={styles.previewCard}>
						<Text style={styles.sectionTitle}>Selected Image</Text>
						<Image source={{ uri: imageUri }} style={styles.previewImage} />
					</View>
				) : null}

				{analysis ? (
					<View style={styles.previewCard}>
						<Text style={styles.sectionTitle}>AI Result</Text>
						<Text style={styles.resultTitle}>{analysis.sheetTitle || 'Untitled sheet'}</Text>

						<Text style={styles.subsectionTitle}>Template Name</Text>
						<TextInput
							style={styles.templateNameInput}
							value={templateName}
							onChangeText={setTemplateName}
							placeholder="Template name"
							placeholderTextColor="#9ca3af"
						/>

						<Text style={styles.subsectionTitle}>Columns</Text>
						{detectedColumns.length > 0 ? (
							<>
								<Text style={styles.helperText}>
									Tap a field type to switch between number, text, and yes/no before saving.
								</Text>
								{detectedColumns.map((column) => (
									<View key={column.id} style={styles.resultRow}>
										<Text style={styles.resultLabel}>{column.label}</Text>
										<TouchableOpacity
											style={[
												styles.fieldTypeChip,
												column.fieldType === 'text'
													? styles.fieldTypeChipText
													: column.fieldType === 'boolean'
														? styles.fieldTypeChipBoolean
														: styles.fieldTypeChipNumber,
											]}
											onPress={() => toggleColumnFieldType(column.id)}
										>
											<Text
												style={[
													styles.fieldTypeChipTextLabel,
													column.fieldType === 'text'
														? styles.fieldTypeChipTextLabelText
														: column.fieldType === 'boolean'
															? styles.fieldTypeChipTextLabelBoolean
															: styles.fieldTypeChipTextLabelNumber,
												]}
											>
												{column.fieldType === 'text'
													? 'Text'
													: column.fieldType === 'boolean'
														? 'Yes / No'
														: 'Number'}
											</Text>
										</TouchableOpacity>
									</View>
								))}
							</>
						) : (
							<Text style={styles.emptyState}>No columns detected.</Text>
						)}

						<Text style={styles.subsectionTitle}>Products</Text>
						{analysis.products.length > 0 ? (
							analysis.products.map((product, index) => (
								<Text key={`${product}-${index}`} style={styles.productItem}>
									• {product}
								</Text>
							))
						) : (
							<Text style={styles.emptyState}>No products detected.</Text>
						)}

						<TouchableOpacity
							style={[styles.saveButton, saveTemplate.isPending && styles.buttonDisabled]}
							onPress={handleSaveTemplate}
							disabled={saveTemplate.isPending}
							accessibilityRole="button"
							accessibilityLabel="Save the scanned sheet template"
						>
							{saveTemplate.isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.buttonText}>Save Template</Text>
							)}
						</TouchableOpacity>
					</View>
				) : null}

				<TouchableOpacity
					style={styles.linkButton}
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Go back"
				>
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
	header: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 12,
		backgroundColor: '#fff',
		borderBottomWidth: 1,
		borderBottomColor: '#e5e5ea',
	},
	title: {
		fontSize: 24,
		fontWeight: '700',
		color: '#1c1c1e',
	},
	subtitle: {
		fontSize: 14,
		color: '#8e8e93',
		marginTop: 6,
	},
	content: {
		padding: 16,
		paddingBottom: 40,
	},
	actions: {
		gap: 12,
	},
	button: {
		backgroundColor: '#007AFF',
		paddingVertical: 14,
		borderRadius: 10,
		alignItems: 'center',
	},
	secondaryButton: {
		backgroundColor: '#fff',
		paddingVertical: 14,
		borderRadius: 10,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#007AFF',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	buttonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	secondaryButtonText: {
		color: '#007AFF',
		fontSize: 16,
		fontWeight: '600',
	},
	loader: {
		marginVertical: 24,
	},
	previewCard: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		marginTop: 16,
	},
	previewImage: {
		width: '100%',
		height: 220,
		borderRadius: 10,
		marginTop: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#1c1c1e',
	},
	subsectionTitle: {
		fontSize: 15,
		fontWeight: '700',
		color: '#1c1c1e',
		marginTop: 16,
		marginBottom: 8,
	},
	resultTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1c1c1e',
		marginTop: 8,
	},
	helperText: {
		fontSize: 13,
		lineHeight: 18,
		color: '#6b7280',
		marginBottom: 8,
	},
	templateNameInput: {
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
		color: '#111827',
		marginTop: 8,
	},
	resultRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	resultLabel: {
		fontSize: 15,
		color: '#1c1c1e',
		flex: 1,
		paddingRight: 12,
	},
	fieldTypeChip: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		borderWidth: 1,
	},
	fieldTypeChipNumber: {
		backgroundColor: '#eff6ff',
		borderColor: '#93c5fd',
	},
	fieldTypeChipText: {
		backgroundColor: '#ecfdf5',
		borderColor: '#86efac',
	},
	fieldTypeChipBoolean: {
		backgroundColor: '#fff7ed',
		borderColor: '#fdba74',
	},
	fieldTypeChipTextLabel: {
		fontSize: 12,
		fontWeight: '700',
	},
	fieldTypeChipTextLabelNumber: {
		color: '#1d4ed8',
	},
	fieldTypeChipTextLabelText: {
		color: '#047857',
	},
	fieldTypeChipTextLabelBoolean: {
		color: '#c2410c',
	},
	productItem: {
		fontSize: 14,
		color: '#1c1c1e',
		marginBottom: 6,
	},
	emptyState: {
		fontSize: 14,
		color: '#8e8e93',
	},
	error: {
		color: '#d70015',
		marginBottom: 12,
		fontSize: 14,
	},
	success: {
		color: '#1b7f2a',
		marginBottom: 12,
		fontSize: 14,
	},
	saveButton: {
		backgroundColor: '#1b7f2a',
		paddingVertical: 14,
		borderRadius: 10,
		alignItems: 'center',
		marginTop: 16,
	},
	linkButton: {
		alignItems: 'center',
		paddingVertical: 18,
	},
	linkButtonText: {
		color: '#007AFF',
		fontSize: 15,
		fontWeight: '600',
	},
});
