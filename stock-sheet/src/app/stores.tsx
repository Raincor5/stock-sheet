import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useCreateStore, useMyStores } from '@/hooks/useStores';

export default function StoresScreen() {
	useRequireRole('authenticated');

	const [showAddModal, setShowAddModal] = useState(false);
	const [storeName, setStoreName] = useState('');
	const createStore = useCreateStore();
	const { data: stores, isLoading } = useMyStores();

	const handleAddStore = async () => {
		try {
			await createStore.mutateAsync({ name: storeName.trim() });
			setStoreName('');
			setShowAddModal(false);
		} catch (error) {
			console.error('Failed to create store:', error);
		}
	};

	return (
		<>
			<SafeAreaView style={styles.container}>
				<View style={styles.header}>
					<Text style={styles.title}>Store Management</Text>
					<TouchableOpacity
						style={styles.addButton}
						onPress={() => setShowAddModal(true)}
					>
						<Text style={styles.addButtonText}>+ Add Store</Text>
					</TouchableOpacity>
				</View>

				<ScrollView style={styles.content}>
					{isLoading ? (
						<ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
					) : stores && stores.length > 0 ? (
						stores.map((store) => (
							<View key={store.id} style={styles.storeCard}>
								<View style={styles.storeHeader}>
									<Text style={styles.storeName}>{store.name}</Text>
									<TouchableOpacity>
										<Text style={styles.menuIcon}>...</Text>
									</TouchableOpacity>
								</View>
							</View>
						))
					) : (
						<View style={styles.empty}>
							<Text style={styles.emptyText}>No stores yet</Text>
							<Text style={styles.emptySubtext}>Add a store to get started</Text>
						</View>
					)}
				</ScrollView>
			</SafeAreaView>

			<Modal visible={showAddModal} animationType="slide">
				<SafeAreaView style={styles.modal}>
					<View style={styles.modalHeader}>
						<TouchableOpacity
							onPress={() => {
								setShowAddModal(false);
								setStoreName('');
							}}
						>
							<Text style={styles.cancelButton}>Cancel</Text>
						</TouchableOpacity>
						<Text style={styles.modalTitle}>New Store</Text>
						<TouchableOpacity
							onPress={handleAddStore}
							disabled={!storeName.trim() || createStore.isPending}
						>
							<Text
								style={[
									styles.saveButton,
									(!storeName.trim() || createStore.isPending) && styles.saveButtonDisabled,
								]}
							>
								Save
							</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.form}>
						<Text style={styles.label}>Store Name</Text>
						<TextInput
							style={styles.input}
							placeholder="e.g., Main Store"
							value={storeName}
							onChangeText={setStoreName}
							editable={!createStore.isPending}
						/>

						{createStore.isPending ? (
							<ActivityIndicator
								size="large"
								color="#007AFF"
								style={styles.loader}
							/>
						) : null}
					</View>
				</SafeAreaView>
			</Modal>
		</>
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
	title: {
		fontSize: 18,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	addButton: {
		backgroundColor: '#007AFF',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 6,
	},
	addButtonText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '600',
	},
	content: {
		flex: 1,
		padding: 16,
	},
	loader: {
		marginVertical: 20,
	},
	storeCard: {
		backgroundColor: '#fff',
		borderRadius: 8,
		padding: 16,
		marginBottom: 12,
		borderLeftWidth: 4,
		borderLeftColor: '#34C759',
	},
	storeHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	storeName: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	storeLocation: {
		fontSize: 14,
		color: '#8e8e93',
		marginTop: 8,
	},
	menuIcon: {
		fontSize: 18,
		color: '#8e8e93',
	},
	empty: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 40,
	},
	emptyText: {
		fontSize: 18,
		fontWeight: '600',
		color: '#1c1c1e',
		marginBottom: 8,
	},
	emptySubtext: {
		fontSize: 14,
		color: '#8e8e93',
	},
	modal: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 16,
		backgroundColor: '#fff',
		borderBottomWidth: 1,
		borderBottomColor: '#e5e5ea',
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#1c1c1e',
	},
	cancelButton: {
		fontSize: 16,
		color: '#007AFF',
	},
	saveButton: {
		fontSize: 16,
		color: '#007AFF',
		fontWeight: '600',
	},
	saveButtonDisabled: {
		opacity: 0.5,
	},
	form: {
		padding: 16,
	},
	label: {
		fontSize: 14,
		fontWeight: '600',
		color: '#1c1c1e',
		marginBottom: 8,
	},
	input: {
		backgroundColor: '#fff',
		borderWidth: 1,
		borderColor: '#e5e5ea',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 16,
		marginBottom: 20,
	},
});
