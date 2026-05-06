/**
 * Stores, roles, invites, and permission overrides API
 */

import { supabase } from '@/lib/auth/client';
import {
	DOCUMENT_PERMISSION_KEYS,
	getEffectivePermissions,
	normalizePermissions,
	normalizeStoreRoleSlug,
	sanitizePermissionPatch,
	slugifyRoleName,
	type StoreRolePermissionKey,
	type StoreRolePermissions,
} from '@/lib/permissions';
import type { Database, Json } from '@/types/supabase';

type StoreRow = Database['public']['Tables']['stores']['Row'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];
type StoreMemberRow = Database['public']['Tables']['store_members']['Row'];
type StoreRoleRow = Database['public']['Tables']['store_roles']['Row'];
type StoreInviteRow = Database['public']['Tables']['store_invites']['Row'];
type StoreInviteInsert = Database['public']['Tables']['store_invites']['Insert'];
type SheetTemplateRoleOverrideRow =
	Database['public']['Tables']['sheet_template_role_overrides']['Row'];
type SheetTemplateRoleOverrideInsert =
	Database['public']['Tables']['sheet_template_role_overrides']['Insert'];

export interface StoreRoleRecord extends Omit<StoreRoleRow, 'permissions'> {
	permissions: StoreRolePermissions;
}

export interface StoreMembershipRecord extends StoreMemberRow {
	store_role: StoreRoleRecord | null;
	roleSlug: string;
	permissions: StoreRolePermissions;
}

export interface StoreInviteRecord extends Omit<StoreInviteRow, 'role_id'> {
	role_id: string;
	store_role: StoreRoleRecord | null;
	roleSlug: string;
	permissions: StoreRolePermissions;
}

export interface TemplateRoleOverrideRecord
	extends Omit<SheetTemplateRoleOverrideRow, 'permissions'> {
	permissions: Partial<Record<StoreRolePermissionKey, boolean>>;
	store_role: StoreRoleRecord | null;
}

function normalizeEmail(value: string) {
	return value.trim().toLowerCase();
}

function normalizePermissionPatch(
	value: Json | null | undefined
): Partial<Record<StoreRolePermissionKey, boolean>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const record = value as Record<string, unknown>;
	const patch: Partial<Record<StoreRolePermissionKey, boolean>> = {};

	DOCUMENT_PERMISSION_KEYS.forEach((key) => {
		if (typeof record[key] === 'boolean') {
			patch[key] = record[key] as boolean;
		}
	});

	return patch;
}

function normalizeStoreRole(role: StoreRoleRow | null | undefined): StoreRoleRecord | null {
	if (!role) {
		return null;
	}

	return {
		...role,
		permissions: normalizePermissions(role.permissions, role.slug),
	};
}

function normalizeMembershipRow(
	row: StoreMemberRow & { store_role?: StoreRoleRow | null }
): StoreMembershipRecord {
	const storeRole = normalizeStoreRole(row.store_role);
	return {
		...row,
		store_role: storeRole,
		roleSlug: normalizeStoreRoleSlug(storeRole?.slug),
		permissions: getEffectivePermissions(
			storeRole?.permissions as unknown as Json,
			storeRole?.slug
		),
	};
}

function normalizeInviteRow(
	row: StoreInviteRow & { store_role?: StoreRoleRow | null }
): StoreInviteRecord {
	const storeRole = normalizeStoreRole(row.store_role);
	return {
		...row,
		store_role: storeRole,
		roleSlug: normalizeStoreRoleSlug(storeRole?.slug),
		permissions: getEffectivePermissions(
			storeRole?.permissions as unknown as Json,
			storeRole?.slug
		),
	};
}

function normalizeOverrideRow(
	row: SheetTemplateRoleOverrideRow & { store_role?: StoreRoleRow | null }
): TemplateRoleOverrideRecord {
	return {
		...row,
		store_role: normalizeStoreRole(row.store_role),
		permissions: normalizePermissionPatch(row.permissions),
	};
}

export async function fetchMyStores(): Promise<StoreRow[]> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError) {
		throw new Error(`Failed to verify signed-in user: ${userError.message}`);
	}

	if (!user) {
		return [];
	}

	const { data: memberships, error: membershipError } = await supabase
		.from('store_members')
		.select('store_id')
		.eq('user_id', user.id);

	if (membershipError) {
		throw new Error(`Failed to fetch store memberships: ${membershipError.message}`);
	}

	const storeIds = (memberships ?? []).map((membership) => membership.store_id);
	if (storeIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('stores')
		.select('*')
		.in('id', storeIds)
		.order('name', { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch stores: ${error.message}`);
	}

	return data || [];
}

export async function fetchStoreById(storeId: string): Promise<StoreRow | null> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError) {
		throw new Error(`Failed to verify signed-in user: ${userError.message}`);
	}

	if (!user) {
		return null;
	}

	const { data: membership, error: membershipError } = await supabase
		.from('store_members')
		.select('id')
		.eq('store_id', storeId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (membershipError) {
		throw new Error(`Failed to verify store membership: ${membershipError.message}`);
	}

	if (!membership) {
		return null;
	}

	const { data, error } = await supabase
		.from('stores')
		.select('*')
		.eq('id', storeId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch store: ${error.message}`);
	}

	return data;
}

export async function fetchUserStoreMemberships(userId: string): Promise<StoreMembershipRecord[]> {
	const { data, error } = await supabase
		.from('store_members')
		.select('*, store_role:store_roles(*)')
		.eq('user_id', userId)
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch memberships: ${error.message}`);
	}

	return ((data ?? []) as Array<StoreMemberRow & { store_role?: StoreRoleRow | null }>).map(
		normalizeMembershipRow
	);
}

export async function acceptPendingStoreInvites(userId: string, email: string) {
	const normalizedEmail = normalizeEmail(email);
	if (!normalizedEmail) {
		return [];
	}

	const { data: invites, error: inviteError } = await supabase
		.from('store_invites')
		.select('*, store_role:store_roles(*)')
		.eq('status', 'pending')
		.eq('email', normalizedEmail);

	if (inviteError) {
		throw new Error(`Failed to fetch pending invites: ${inviteError.message}`);
	}

	if (!invites || invites.length === 0) {
		return [];
	}

	const inviteRows = invites as Array<StoreInviteRow & { store_role?: StoreRoleRow | null }>;
	const membershipsToUpsert = inviteRows.map((invite) => ({
		store_id: invite.store_id,
		user_id: userId,
		member_email: normalizedEmail,
		role_id: invite.role_id,
	}));

	const { error: upsertError } = await supabase
		.from('store_members')
		.upsert(membershipsToUpsert, { onConflict: 'store_id,user_id' });

	if (upsertError) {
		throw new Error(`Failed to accept pending invites: ${upsertError.message}`);
	}

	const { error: updateError } = await supabase
		.from('store_invites')
		.update({
			status: 'accepted',
			responded_at: new Date().toISOString(),
		})
		.in(
			'id',
			inviteRows.map((invite) => invite.id)
		);

	if (updateError) {
		throw new Error(`Failed to mark invites as accepted: ${updateError.message}`);
	}

	return inviteRows.map(normalizeInviteRow);
}

export async function createStore(store: Pick<StoreInsert, 'name'>): Promise<StoreRow> {
	const { data: userData, error: userError } = await supabase.auth.getUser();

	if (userError) {
		throw new Error(`Failed to verify signed-in user: ${userError.message}`);
	}

	const userId = userData.user?.id;
	const userEmail = normalizeEmail(userData.user?.email ?? '');

	if (!userId || !userEmail) {
		throw new Error('You must be signed in with a valid email address to create a store.');
	}

	const { data, error } = await supabase.from('stores').insert([store]).select().single();

	if (error) {
		throw new Error(`Failed to create store: ${error.message}`);
	}

	const { data: ownerRole, error: roleError } = await supabase
		.from('store_roles')
		.select('*')
		.eq('store_id', data.id)
		.eq('slug', 'owner')
		.single();

	if (roleError || !ownerRole) {
		await supabase.from('stores').delete().eq('id', data.id);
		throw new Error(`Failed to resolve owner role: ${roleError?.message ?? 'Missing owner role'}`);
	}

	const { error: memberError } = await supabase.from('store_members').insert([
		{
			store_id: data.id,
			user_id: userId,
			member_email: userEmail,
			role_id: ownerRole.id,
		},
	]);

	if (memberError) {
		await supabase.from('stores').delete().eq('id', data.id);
		throw new Error(`Failed to create store membership: ${memberError.message}`);
	}

	return data;
}

export async function fetchStoreMembership(
	storeId: string,
	userId: string
): Promise<StoreMembershipRecord | null> {
	const { data, error } = await supabase
		.from('store_members')
		.select('*, store_role:store_roles(*)')
		.eq('store_id', storeId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch store membership: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return normalizeMembershipRow(data as StoreMemberRow & { store_role?: StoreRoleRow | null });
}

export async function fetchStoreRoles(storeId: string): Promise<StoreRoleRecord[]> {
	const { data, error } = await supabase
		.from('store_roles')
		.select('*')
		.eq('store_id', storeId)
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch store roles: ${error.message}`);
	}

	return ((data ?? []) as StoreRoleRow[]).map(normalizeStoreRole).filter(Boolean) as StoreRoleRecord[];
}

export async function createStoreRole(params: {
	storeId: string;
	name: string;
	permissions: Partial<Record<StoreRolePermissionKey, boolean>>;
}) {
	const normalizedName = params.name.trim().replace(/\s+/g, ' ');
	const slug = slugifyRoleName(normalizedName);

	if (!normalizedName || !slug) {
		throw new Error('Role name is required.');
	}

	const { data, error } = await supabase
		.from('store_roles')
		.insert([
			{
				store_id: params.storeId,
				name: normalizedName,
				slug,
				is_system: false,
				permissions: sanitizePermissionPatch(
					params.permissions,
					Object.keys(normalizePermissions(null)) as StoreRolePermissionKey[]
				),
			},
		])
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to create role: ${error.message}`);
	}

	return normalizeStoreRole(data as StoreRoleRow)!;
}

export async function updateStoreRole(
	roleId: string,
	updates: {
		name?: string;
		permissions?: Partial<Record<StoreRolePermissionKey, boolean>>;
	}
) {
	const payload: Database['public']['Tables']['store_roles']['Update'] = {};

	if (updates.name !== undefined) {
		const normalizedName = updates.name.trim().replace(/\s+/g, ' ');
		const slug = slugifyRoleName(normalizedName);
		if (!normalizedName || !slug) {
			throw new Error('Role name is required.');
		}
		payload.name = normalizedName;
		payload.slug = slug;
	}

	if (updates.permissions !== undefined) {
		payload.permissions = sanitizePermissionPatch(
			updates.permissions,
			Object.keys(normalizePermissions(null)) as StoreRolePermissionKey[]
		);
	}

	const { data, error } = await supabase
		.from('store_roles')
		.update(payload)
		.eq('id', roleId)
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to update role: ${error.message}`);
	}

	return normalizeStoreRole(data as StoreRoleRow)!;
}

export async function fetchStoreMembers(storeId: string): Promise<StoreMembershipRecord[]> {
	const { data, error } = await supabase
		.from('store_members')
		.select('*, store_role:store_roles(*)')
		.eq('store_id', storeId)
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch store members: ${error.message}`);
	}

	return ((data ?? []) as Array<StoreMemberRow & { store_role?: StoreRoleRow | null }>).map(
		normalizeMembershipRow
	);
}

export async function updateStoreMemberRole(memberId: string, roleId: string) {
	const { data, error } = await supabase
		.from('store_members')
		.update({ role_id: roleId })
		.eq('id', memberId)
		.select('*, store_role:store_roles(*)')
		.single();

	if (error) {
		throw new Error(`Failed to update member role: ${error.message}`);
	}

	return normalizeMembershipRow(data as StoreMemberRow & { store_role?: StoreRoleRow | null });
}

export async function removeStoreMember(memberId: string) {
	const { error } = await supabase.from('store_members').delete().eq('id', memberId);

	if (error) {
		throw new Error(`Failed to remove store member: ${error.message}`);
	}
}

export async function fetchStoreInvites(storeId: string): Promise<StoreInviteRecord[]> {
	const { data, error } = await supabase
		.from('store_invites')
		.select('*, store_role:store_roles(*)')
		.eq('store_id', storeId)
		.order('created_at', { ascending: false });

	if (error) {
		throw new Error(`Failed to fetch store invites: ${error.message}`);
	}

	return ((data ?? []) as Array<StoreInviteRow & { store_role?: StoreRoleRow | null }>).map(
		normalizeInviteRow
	);
}

export async function createStoreInvite(params: {
	storeId: string;
	email: string;
	roleId: string;
	invitedByUserId: string;
}) {
	const payload: StoreInviteInsert = {
		store_id: params.storeId,
		email: normalizeEmail(params.email),
		role_id: params.roleId,
		invited_by_user_id: params.invitedByUserId,
		status: 'pending',
	};

	const { data, error } = await supabase
		.from('store_invites')
		.insert([payload])
		.select('*, store_role:store_roles(*)')
		.single();

	if (error) {
		throw new Error(`Failed to create invite: ${error.message}`);
	}

	return normalizeInviteRow(data as StoreInviteRow & { store_role?: StoreRoleRow | null });
}

export async function revokeStoreInvite(inviteId: string) {
	const { data, error } = await supabase
		.from('store_invites')
		.update({
			status: 'revoked',
			responded_at: new Date().toISOString(),
		})
		.eq('id', inviteId)
		.select('*, store_role:store_roles(*)')
		.single();

	if (error) {
		throw new Error(`Failed to revoke invite: ${error.message}`);
	}

	return normalizeInviteRow(data as StoreInviteRow & { store_role?: StoreRoleRow | null });
}

export async function fetchTemplateRoleOverrides(
	storeId: string
): Promise<TemplateRoleOverrideRecord[]> {
	const { data: templates, error: templateError } = await supabase
		.from('sheet_templates')
		.select('id')
		.eq('store_id', storeId);

	if (templateError) {
		throw new Error(`Failed to fetch templates for overrides: ${templateError.message}`);
	}

	const templateIds = (templates ?? []).map((template) => template.id);

	if (templateIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('sheet_template_role_overrides')
		.select('*, store_role:store_roles(*)')
		.in('sheet_template_id', templateIds);

	if (error) {
		throw new Error(`Failed to fetch template overrides: ${error.message}`);
	}

	return (
		(data ?? []) as Array<
			SheetTemplateRoleOverrideRow & { store_role?: StoreRoleRow | null }
		>
	).map(normalizeOverrideRow);
}

export async function upsertTemplateRoleOverride(params: {
	sheetTemplateId: string;
	storeRoleId: string;
	permissions: Partial<Record<StoreRolePermissionKey, boolean>>;
}) {
	const normalizedPermissions = sanitizePermissionPatch(
		params.permissions,
		DOCUMENT_PERMISSION_KEYS
	);

	if (Object.keys(normalizedPermissions).length === 0) {
		const { error } = await supabase
			.from('sheet_template_role_overrides')
			.delete()
			.eq('sheet_template_id', params.sheetTemplateId)
			.eq('store_role_id', params.storeRoleId);

		if (error) {
			throw new Error(`Failed to clear document override: ${error.message}`);
		}

		return null;
	}

	const payload: SheetTemplateRoleOverrideInsert = {
		sheet_template_id: params.sheetTemplateId,
		store_role_id: params.storeRoleId,
		permissions: normalizedPermissions,
	};

	const { data, error } = await supabase
		.from('sheet_template_role_overrides')
		.upsert([payload], { onConflict: 'sheet_template_id,store_role_id' })
		.select('*, store_role:store_roles(*)')
		.single();

	if (error) {
		throw new Error(`Failed to save document override: ${error.message}`);
	}

	return normalizeOverrideRow(
		data as SheetTemplateRoleOverrideRow & { store_role?: StoreRoleRow | null }
	);
}
