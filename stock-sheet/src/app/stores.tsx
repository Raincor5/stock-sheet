import { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import {
	useCreateStore,
	useCreateStoreInvite,
	useCreateStoreRole,
	useMyStores,
	useRemoveStoreMember,
	useRevokeStoreInvite,
	useStoreInvites,
	useStoreMembership,
	useStoreMembers,
	useStoreRoles,
	useTemplateRoleOverrides,
	useUpdateStoreMemberRole,
	useUpdateStoreRole,
	useUpsertTemplateRoleOverride,
} from '@/hooks/useStores';
import { useSheetTemplates } from '@/hooks/useSheet';
import {
	DOCUMENT_PERMISSION_KEYS,
	PERMISSION_LABELS,
	getDefaultPermissionsForRole,
	hasPermission,
	mergePermissions,
	togglePermissionValue,
	type StoreRolePermissions,
	type StoreRolePermissionKey,
} from '@/lib/permissions';
import { getUsableTemplates } from '@/lib/api/sheetTemplates';

export default function StoresScreen() {
	useRequireRole('authenticated');

	const { user, storeId: authStoreId } = useAuth();
	const { data: stores, isLoading: storesLoading } = useMyStores();
	const [selectedStoreId, setSelectedStoreId] = useState<string | null>(authStoreId);
	const [showAddModal, setShowAddModal] = useState(false);
	const [storeName, setStoreName] = useState('');
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRoleId, setInviteRoleId] = useState<string | null>(null);
	const [customRoleName, setCustomRoleName] = useState('');
	const [customRolePermissions, setCustomRolePermissions] = useState<StoreRolePermissions>(
		getDefaultPermissionsForRole('employee')
	);
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

	const createStore = useCreateStore();
	const createInvite = useCreateStoreInvite();
	const revokeInvite = useRevokeStoreInvite();
	const createRole = useCreateStoreRole();
	const updateRole = useUpdateStoreRole();
	const updateMemberRole = useUpdateStoreMemberRole();
	const removeMember = useRemoveStoreMember();
	const updateTemplateOverride = useUpsertTemplateRoleOverride();

	const { data: membership } = useStoreMembership(selectedStoreId, user?.id ?? null);
	const { data: members, isLoading: membersLoading } = useStoreMembers(selectedStoreId);
	const { data: roles, isLoading: rolesLoading } = useStoreRoles(selectedStoreId);
	const { data: invites, isLoading: invitesLoading } = useStoreInvites(selectedStoreId);
	const { data: templates, isLoading: templatesLoading } = useSheetTemplates(selectedStoreId);
	const { data: templateOverrides, isLoading: overridesLoading } =
		useTemplateRoleOverrides(selectedStoreId);

	useEffect(() => {
		if (!selectedStoreId && stores && stores.length > 0) {
			setSelectedStoreId(authStoreId ?? stores[0].id);
		}
	}, [authStoreId, selectedStoreId, stores]);

	const usableTemplates = useMemo(() => getUsableTemplates(templates), [templates]);
	const assignableRoles = useMemo(
		() => (roles ?? []).filter((role) => role.slug !== 'owner'),
		[roles]
	);

	useEffect(() => {
		if (
			assignableRoles.length > 0 &&
			(!inviteRoleId || !assignableRoles.some((role) => role.id === inviteRoleId))
		) {
			setInviteRoleId(assignableRoles[0].id);
		}
		if (assignableRoles.length === 0) {
			setInviteRoleId(null);
		}
	}, [assignableRoles, inviteRoleId]);

	useEffect(() => {
		if (
			usableTemplates.length > 0 &&
			(!selectedTemplateId || !usableTemplates.some((template) => template.id === selectedTemplateId))
		) {
			setSelectedTemplateId(usableTemplates[0].id);
		}
		if (usableTemplates.length === 0) {
			setSelectedTemplateId(null);
		}
	}, [selectedTemplateId, usableTemplates]);

	const selectedTemplate = usableTemplates.find((template) => template.id === selectedTemplateId) ?? null;
	const canManageMembers = hasPermission(membership?.permissions, 'manageMembers');
	const canInviteMembers = hasPermission(membership?.permissions, 'inviteMembers');
	const canManageRoles = hasPermission(membership?.permissions, 'manageRoles');
	const canManageDocumentPermissions = hasPermission(
		membership?.permissions,
		'manageDocumentPermissions'
	);

	const handleAddStore = async () => {
		if (!storeName.trim()) {
			return;
		}

		try {
			const created = await createStore.mutateAsync({ name: storeName.trim() });
			setSelectedStoreId(created.id);
			setStoreName('');
			setShowAddModal(false);
		} catch (error: any) {
			Alert.alert('Could not create store', error?.message ?? 'Please try again.');
		}
	};

	const handleInvite = async () => {
		if (!selectedStoreId || !inviteRoleId || !user?.id) {
			return;
		}

		try {
			await createInvite.mutateAsync({
				storeId: selectedStoreId,
				email: inviteEmail,
				roleId: inviteRoleId,
				invitedByUserId: user.id,
			});
			setInviteEmail('');
		} catch (error: any) {
			Alert.alert('Could not create invite', error?.message ?? 'Please try again.');
		}
	};

	const handleCreateCustomRole = async () => {
		if (!selectedStoreId || !customRoleName.trim()) {
			return;
		}

		try {
			await createRole.mutateAsync({
				storeId: selectedStoreId,
				name: customRoleName.trim(),
				permissions: customRolePermissions,
			});
			setCustomRoleName('');
			setCustomRolePermissions(getDefaultPermissionsForRole('employee'));
		} catch (error: any) {
			Alert.alert('Could not create role', error?.message ?? 'Please try again.');
		}
	};

	const handleRolePermissionToggle = async (
		roleId: string,
		storeId: string,
		permissions: StoreRolePermissions
	) => {
		try {
			await updateRole.mutateAsync({
				roleId,
				storeId,
				permissions,
			});
		} catch (error: any) {
			Alert.alert('Could not update role', error?.message ?? 'Please try again.');
		}
	};

	const handleMemberRoleChange = async (memberId: string, roleId: string) => {
		if (!selectedStoreId) {
			return;
		}

		try {
			await updateMemberRole.mutateAsync({ memberId, roleId, storeId: selectedStoreId });
		} catch (error: any) {
			Alert.alert('Could not update member', error?.message ?? 'Please try again.');
		}
	};

	const handleRemoveMember = (memberId: string, memberEmail: string) => {
		if (!selectedStoreId) {
			return;
		}

		Alert.alert('Remove Member', `Remove ${memberEmail} from this store?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Remove',
				style: 'destructive',
				onPress: async () => {
					try {
						await removeMember.mutateAsync({ memberId, storeId: selectedStoreId });
					} catch (error: any) {
						Alert.alert('Could not remove member', error?.message ?? 'Please try again.');
					}
				},
			},
		]);
	};

	const handleRevokeInvite = async (inviteId: string, storeId: string) => {
		try {
			await revokeInvite.mutateAsync({ inviteId, storeId });
		} catch (error: any) {
			Alert.alert('Could not revoke invite', error?.message ?? 'Please try again.');
		}
	};

	const getOverridePatchForRole = (roleId: string) =>
		(templateOverrides ?? []).find(
			(override) =>
				override.sheet_template_id === selectedTemplateId && override.store_role_id === roleId
		)?.permissions ?? {};

	const handleDocumentPermissionToggle = async (
		roleId: string,
		basePermissions: StoreRolePermissions,
		key: StoreRolePermissionKey
	) => {
		if (!selectedStoreId || !selectedTemplateId) {
			return;
		}

		const currentPatch = { ...getOverridePatchForRole(roleId) };
		const currentEffective = mergePermissions(basePermissions, currentPatch as never);
		const nextEffective = togglePermissionValue(currentEffective, key);
		const nextPatch: Partial<Record<StoreRolePermissionKey, boolean>> = {};

		DOCUMENT_PERMISSION_KEYS.forEach((permissionKey) => {
			if (nextEffective[permissionKey] !== basePermissions[permissionKey]) {
				nextPatch[permissionKey] = nextEffective[permissionKey];
			}
		});

		try {
			await updateTemplateOverride.mutateAsync({
				storeId: selectedStoreId,
				sheetTemplateId: selectedTemplateId,
				storeRoleId: roleId,
				permissions: nextPatch,
			});
		} catch (error: any) {
			Alert.alert('Could not update document access', error?.message ?? 'Please try again.');
		}
	};

	const renderPermissionRow = (
		permissions: StoreRolePermissions,
		onToggle: (key: StoreRolePermissionKey) => void,
		disabled = false,
		keys = Object.keys(PERMISSION_LABELS) as StoreRolePermissionKey[]
	) => (
		<View style={styles.permissionWrap}>
			{keys.map((key) => (
				<TouchableOpacity
					key={key}
					style={[
						styles.permissionChip,
						permissions[key] && styles.permissionChipEnabled,
						disabled && styles.permissionChipDisabled,
					]}
					onPress={() => !disabled && onToggle(key)}
					disabled={disabled}
				>
					<Text
						style={[
							styles.permissionChipText,
							permissions[key] && styles.permissionChipTextEnabled,
						]}
					>
						{permissions[key] ? 'On' : 'Off'} · {PERMISSION_LABELS[key]}
					</Text>
				</TouchableOpacity>
			))}
		</View>
	);

	return (
		<>
			<SafeAreaView style={styles.container}>
				<View style={styles.header}>
					<View>
						<Text style={styles.title}>Admin Panel</Text>
						<Text style={styles.subtitle}>
							Stores, invites, roles, and document access all live here now.
						</Text>
					</View>
					<TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
						<Text style={styles.addButtonText}>+ New Store</Text>
					</TouchableOpacity>
				</View>

				<ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Stores</Text>
						{storesLoading ? (
							<ActivityIndicator color="#007AFF" />
						) : stores && stores.length > 0 ? (
							<View style={styles.cardList}>
								{stores.map((store) => (
									<TouchableOpacity
										key={store.id}
										style={[
											styles.storeCard,
											selectedStoreId === store.id && styles.storeCardSelected,
										]}
										onPress={() => setSelectedStoreId(store.id)}
									>
										<Text style={styles.storeName}>{store.name}</Text>
										<Text style={styles.storeMeta}>
											{selectedStoreId === store.id ? 'Selected store' : 'Tap to manage'}
										</Text>
									</TouchableOpacity>
								))}
							</View>
						) : (
							<Text style={styles.emptyText}>No stores yet. Create one to get started.</Text>
						)}
					</View>

					{selectedStoreId ? (
						<>
							<View style={styles.section}>
								<Text style={styles.sectionTitle}>Your Access</Text>
								<View style={styles.panel}>
									<Text style={styles.panelTitle}>
										{membership?.store_role?.name ?? 'No access loaded'}
									</Text>
									<Text style={styles.panelBody}>
										Store-level permissions determine who can invite members, manage roles,
										and adjust document access for templates.
									</Text>
								</View>
							</View>

							<View style={styles.section}>
								<Text style={styles.sectionTitle}>Team</Text>
								{membersLoading ? (
									<ActivityIndicator color="#007AFF" />
								) : (
									<View style={styles.cardList}>
										{(members ?? []).map((member) => (
											<View key={member.id} style={styles.panel}>
												<View style={styles.rowBetween}>
													<View style={styles.memberMeta}>
														<Text style={styles.panelTitle}>{member.member_email}</Text>
														<Text style={styles.panelSubtle}>
															{member.store_role?.name ?? 'Unassigned'}
														</Text>
													</View>
													{canManageMembers &&
													member.store_role?.slug !== 'owner' &&
													member.user_id !== user?.id ? (
														<TouchableOpacity
															style={styles.dangerButton}
															onPress={() =>
																handleRemoveMember(member.id, member.member_email)
															}
														>
															<Text style={styles.dangerButtonText}>Remove</Text>
														</TouchableOpacity>
													) : null}
												</View>

												{member.store_role?.slug === 'owner' ? (
													<Text style={styles.panelSubtle}>
														Owner access is fixed for this panel.
													</Text>
												) : canManageRoles ? (
													<View style={styles.chipRow}>
														{assignableRoles.map((role) => (
															<TouchableOpacity
																key={role.id}
																style={[
																	styles.choiceChip,
																	member.role_id === role.id && styles.choiceChipActive,
																]}
																onPress={() => handleMemberRoleChange(member.id, role.id)}
															>
																<Text
																	style={[
																		styles.choiceChipText,
																		member.role_id === role.id &&
																			styles.choiceChipTextActive,
																	]}
																>
																	{role.name}
																</Text>
															</TouchableOpacity>
														))}
													</View>
												) : null}
											</View>
										))}
									</View>
								)}
							</View>

							{canInviteMembers ? (
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Invites</Text>
									<View style={styles.panel}>
										<TextInput
											style={styles.input}
											placeholder="employee@example.com"
											value={inviteEmail}
											onChangeText={setInviteEmail}
											autoCapitalize="none"
											keyboardType="email-address"
										/>
										<View style={styles.chipRow}>
											{assignableRoles.map((role) => (
												<TouchableOpacity
													key={role.id}
													style={[
														styles.choiceChip,
														inviteRoleId === role.id && styles.choiceChipActive,
													]}
													onPress={() => setInviteRoleId(role.id)}
												>
													<Text
														style={[
															styles.choiceChipText,
															inviteRoleId === role.id && styles.choiceChipTextActive,
														]}
													>
														{role.name}
													</Text>
												</TouchableOpacity>
											))}
										</View>
										<TouchableOpacity
											style={[
												styles.primaryButton,
												(!inviteEmail.trim() || !inviteRoleId || createInvite.isPending) &&
													styles.buttonDisabled,
											]}
											onPress={handleInvite}
											disabled={!inviteEmail.trim() || !inviteRoleId || createInvite.isPending}
										>
											<Text style={styles.primaryButtonText}>Create Invite</Text>
										</TouchableOpacity>
									</View>

									{invitesLoading ? (
										<ActivityIndicator color="#007AFF" />
									) : (
										<View style={styles.cardList}>
											{(invites ?? []).map((invite) => (
												<View key={invite.id} style={styles.panel}>
													<View style={styles.rowBetween}>
														<View>
															<Text style={styles.panelTitle}>{invite.email}</Text>
															<Text style={styles.panelSubtle}>
																{invite.store_role?.name ?? 'Unknown role'} · {invite.status}
															</Text>
														</View>
														{invite.status === 'pending' ? (
															<TouchableOpacity
																style={styles.dangerButton}
																onPress={() => handleRevokeInvite(invite.id, invite.store_id)}
															>
																<Text style={styles.dangerButtonText}>Revoke</Text>
															</TouchableOpacity>
														) : null}
													</View>
												</View>
											))}
										</View>
									)}
								</View>
							) : null}

							{canManageRoles ? (
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Roles</Text>
									<View style={styles.cardList}>
										{rolesLoading ? (
											<ActivityIndicator color="#007AFF" />
										) : (
											(roles ?? []).map((role) => (
												<View key={role.id} style={styles.panel}>
													<Text style={styles.panelTitle}>{role.name}</Text>
													<Text style={styles.panelSubtle}>
														{role.is_system ? 'System role' : 'Custom role'}
													</Text>
													{renderPermissionRow(
														role.permissions,
														(key) =>
															handleRolePermissionToggle(
																role.id,
																role.store_id,
																togglePermissionValue(role.permissions, key)
															),
														role.slug === 'owner'
													)}
												</View>
											))
										)}
									</View>

									<View style={styles.panel}>
										<Text style={styles.panelTitle}>Create Custom Role</Text>
										<TextInput
											style={styles.input}
											placeholder="e.g. Supervisor"
											value={customRoleName}
											onChangeText={setCustomRoleName}
										/>
										{renderPermissionRow(customRolePermissions, (key) =>
											setCustomRolePermissions((prev) => togglePermissionValue(prev, key))
										)}
										<TouchableOpacity
											style={[
												styles.primaryButton,
												(!customRoleName.trim() || createRole.isPending) &&
													styles.buttonDisabled,
											]}
											onPress={handleCreateCustomRole}
											disabled={!customRoleName.trim() || createRole.isPending}
										>
											<Text style={styles.primaryButtonText}>Add Role</Text>
										</TouchableOpacity>
									</View>
								</View>
							) : null}

							{canManageDocumentPermissions ? (
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Document Access Overrides</Text>
									{templatesLoading || overridesLoading ? (
										<ActivityIndicator color="#007AFF" />
									) : usableTemplates.length === 0 ? (
										<Text style={styles.emptyText}>
											Create a reusable template first, then override access per role here.
										</Text>
									) : (
										<>
											<View style={styles.chipRow}>
												{usableTemplates.map((template) => (
													<TouchableOpacity
														key={template.id}
														style={[
															styles.choiceChip,
															selectedTemplateId === template.id &&
																styles.choiceChipActive,
														]}
														onPress={() => setSelectedTemplateId(template.id)}
													>
														<Text
															style={[
																styles.choiceChipText,
																selectedTemplateId === template.id &&
																	styles.choiceChipTextActive,
															]}
														>
															{template.name}
														</Text>
													</TouchableOpacity>
												))}
											</View>

											{selectedTemplate ? (
												<View style={styles.cardList}>
													{(roles ?? [])
														.filter((role) => role.slug !== 'owner')
														.map((role) => {
														const basePermissions = role.permissions;
														const overridePatch = getOverridePatchForRole(role.id);
														const effectivePermissions = mergePermissions(
															basePermissions,
															overridePatch as never
														);

														return (
															<View key={role.id} style={styles.panel}>
																<Text style={styles.panelTitle}>{role.name}</Text>
																<Text style={styles.panelSubtle}>
																	Template: {selectedTemplate.name}
																</Text>
																{renderPermissionRow(
																	effectivePermissions,
																	(key) =>
																		handleDocumentPermissionToggle(
																			role.id,
																			basePermissions,
																			key
																		),
																	role.slug === 'owner',
																	DOCUMENT_PERMISSION_KEYS
																)}
															</View>
														);
													})}
												</View>
											) : null}
											<Text style={styles.panelSubtle}>
												Owners always keep full document access and are not overrideable per template.
											</Text>
										</>
									)}
								</View>
							) : null}
						</>
					) : null}
				</ScrollView>
			</SafeAreaView>

			<Modal visible={showAddModal} animationType="slide" transparent>
				<View style={styles.modalOverlay}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>New Store</Text>
						<TextInput
							style={styles.input}
							placeholder="Store name"
							value={storeName}
							onChangeText={setStoreName}
						/>
						<View style={styles.modalActions}>
							<TouchableOpacity
								style={styles.modalSecondaryButton}
								onPress={() => {
									setShowAddModal(false);
									setStoreName('');
								}}
							>
								<Text style={styles.modalSecondaryButtonText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[
									styles.primaryButton,
									(!storeName.trim() || createStore.isPending) && styles.buttonDisabled,
								]}
								onPress={handleAddStore}
								disabled={!storeName.trim() || createStore.isPending}
							>
								<Text style={styles.primaryButtonText}>Create</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f3f4f6',
	},
	header: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		backgroundColor: '#fff',
		borderBottomWidth: 1,
		borderBottomColor: '#e5e7eb',
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 12,
	},
	title: {
		fontSize: 24,
		fontWeight: '700',
		color: '#111827',
	},
	subtitle: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6b7280',
		marginTop: 4,
		maxWidth: 240,
	},
	addButton: {
		backgroundColor: '#111827',
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 10,
	},
	addButtonText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '700',
	},
	content: {
		flex: 1,
	},
	contentContainer: {
		padding: 16,
		paddingBottom: 32,
		gap: 20,
	},
	section: {
		gap: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
	},
	cardList: {
		gap: 12,
	},
	storeCard: {
		backgroundColor: '#fff',
		borderRadius: 14,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e5e7eb',
	},
	storeCardSelected: {
		borderColor: '#111827',
		backgroundColor: '#eef2ff',
	},
	storeName: {
		fontSize: 16,
		fontWeight: '700',
		color: '#111827',
	},
	storeMeta: {
		fontSize: 13,
		color: '#6b7280',
		marginTop: 6,
	},
	panel: {
		backgroundColor: '#fff',
		borderRadius: 14,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e5e7eb',
		gap: 10,
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#111827',
	},
	panelBody: {
		fontSize: 14,
		lineHeight: 20,
		color: '#4b5563',
	},
	panelSubtle: {
		fontSize: 13,
		color: '#6b7280',
	},
	rowBetween: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		gap: 12,
	},
	memberMeta: {
		flex: 1,
		gap: 4,
	},
	input: {
		backgroundColor: '#fff',
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 12,
		fontSize: 15,
		color: '#111827',
	},
	chipRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	choiceChip: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
		backgroundColor: '#f3f4f6',
		borderWidth: 1,
		borderColor: '#d1d5db',
	},
	choiceChipActive: {
		backgroundColor: '#111827',
		borderColor: '#111827',
	},
	choiceChipText: {
		fontSize: 13,
		fontWeight: '600',
		color: '#374151',
	},
	choiceChipTextActive: {
		color: '#fff',
	},
	permissionWrap: {
		gap: 8,
	},
	permissionChip: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 12,
		backgroundColor: '#f9fafb',
		borderWidth: 1,
		borderColor: '#e5e7eb',
	},
	permissionChipEnabled: {
		backgroundColor: '#ecfdf5',
		borderColor: '#10b981',
	},
	permissionChipDisabled: {
		opacity: 0.6,
	},
	permissionChipText: {
		fontSize: 13,
		fontWeight: '600',
		color: '#374151',
	},
	permissionChipTextEnabled: {
		color: '#065f46',
	},
	primaryButton: {
		backgroundColor: '#2563eb',
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
		alignItems: 'center',
	},
	primaryButtonText: {
		color: '#fff',
		fontSize: 15,
		fontWeight: '700',
	},
	dangerButton: {
		backgroundColor: '#fef2f2',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 10,
	},
	dangerButtonText: {
		color: '#b91c1c',
		fontSize: 13,
		fontWeight: '700',
	},
	emptyText: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6b7280',
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(17, 24, 39, 0.32)',
		justifyContent: 'center',
		padding: 20,
	},
	modalCard: {
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 20,
		gap: 16,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#111827',
	},
	modalActions: {
		flexDirection: 'row',
		gap: 12,
	},
	modalSecondaryButton: {
		flex: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
		backgroundColor: '#f3f4f6',
		alignItems: 'center',
	},
	modalSecondaryButtonText: {
		color: '#111827',
		fontSize: 15,
		fontWeight: '700',
	},
});
