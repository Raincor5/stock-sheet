/**
 * Store, membership, invite, and role query hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	createStore,
	createStoreInvite,
	createStoreRole,
	fetchMyStores,
	fetchStoreById,
	fetchStoreInvites,
	fetchStoreMembership,
	fetchStoreMembers,
	fetchStoreRoles,
	fetchTemplateRoleOverrides,
	removeStoreMember,
	revokeStoreInvite,
	updateStoreMemberRole,
	updateStoreRole,
	upsertTemplateRoleOverride,
	type StoreMembershipRecord,
} from '@/lib/api/stores';
import type { StoreRolePermissionKey } from '@/lib/permissions';
import type { Database } from '@/types/supabase';

type StoreInsert = Database['public']['Tables']['stores']['Insert'];

const STORE_CACHE_TIME = 1000 * 60 * 5;

export function useMyStores() {
	return useQuery({
		queryKey: ['stores', 'my'],
		queryFn: fetchMyStores,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useCreateStore() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (store: Pick<StoreInsert, 'name'>) => createStore(store),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['stores', 'my'] });
			queryClient.invalidateQueries({ queryKey: ['store-membership'] });
		},
		onError: (error) => {
			console.error('Failed to create store:', error);
		},
		retry: 3,
	});
}

export function useStore(storeId: string | null) {
	return useQuery({
		queryKey: ['store', storeId],
		queryFn: () => fetchStoreById(storeId!),
		enabled: !!storeId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useStoreMembership(storeId: string | null, userId: string | null) {
	return useQuery({
		queryKey: ['store-membership', storeId, userId],
		queryFn: () => fetchStoreMembership(storeId!, userId!),
		enabled: !!storeId && !!userId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useUserRoleInStore(storeId: string | null, userId: string | null) {
	const query = useStoreMembership(storeId, userId);
	return {
		...query,
		data: query.data?.roleSlug ?? null,
	};
}

export function useStoreMembers(storeId: string | null) {
	return useQuery({
		queryKey: ['store', storeId, 'members'],
		queryFn: () => fetchStoreMembers(storeId!),
		enabled: !!storeId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useStoreRoles(storeId: string | null) {
	return useQuery({
		queryKey: ['store', storeId, 'roles'],
		queryFn: () => fetchStoreRoles(storeId!),
		enabled: !!storeId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useCreateStoreRole() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: createStoreRole,
		onSuccess: (role) => {
			queryClient.invalidateQueries({ queryKey: ['store', role.store_id, 'roles'] });
			queryClient.invalidateQueries({ queryKey: ['store-membership'] });
		},
		onError: (error) => {
			console.error('Failed to create role:', error);
		},
		retry: 3,
	});
}

export function useUpdateStoreRole() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: {
			roleId: string;
			storeId: string;
			name?: string;
			permissions?: Partial<Record<StoreRolePermissionKey, boolean>>;
		}) => updateStoreRole(params.roleId, { name: params.name, permissions: params.permissions }),
		onSuccess: (role) => {
			queryClient.invalidateQueries({ queryKey: ['store', role.store_id, 'roles'] });
			queryClient.invalidateQueries({ queryKey: ['store-membership'] });
			queryClient.invalidateQueries({ queryKey: ['template-role-overrides', role.store_id] });
		},
		onError: (error) => {
			console.error('Failed to update role:', error);
		},
		retry: 3,
	});
}

export function useUpdateStoreMemberRole() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: { memberId: string; roleId: string; storeId: string }) =>
			updateStoreMemberRole(params.memberId, params.roleId),
		onSuccess: (updatedMember: StoreMembershipRecord) => {
			queryClient.invalidateQueries({
				queryKey: ['store', updatedMember.store_id, 'members'],
			});
			queryClient.invalidateQueries({ queryKey: ['store-membership'] });
		},
		onError: (error) => {
			console.error('Failed to update member role:', error);
		},
		retry: 3,
	});
}

export function useRemoveStoreMember() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: { memberId: string; storeId: string }) =>
			removeStoreMember(params.memberId),
		onSuccess: (_, { storeId }) => {
			queryClient.invalidateQueries({ queryKey: ['store', storeId, 'members'] });
			queryClient.invalidateQueries({ queryKey: ['store-membership'] });
		},
		onError: (error) => {
			console.error('Failed to remove member:', error);
		},
		retry: 3,
	});
}

export function useStoreInvites(storeId: string | null) {
	return useQuery({
		queryKey: ['store', storeId, 'invites'],
		queryFn: () => fetchStoreInvites(storeId!),
		enabled: !!storeId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useCreateStoreInvite() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: createStoreInvite,
		onSuccess: (invite) => {
			queryClient.invalidateQueries({ queryKey: ['store', invite.store_id, 'invites'] });
		},
		onError: (error) => {
			console.error('Failed to create invite:', error);
		},
		retry: 3,
	});
}

export function useRevokeStoreInvite() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: { inviteId: string; storeId: string }) =>
			revokeStoreInvite(params.inviteId),
		onSuccess: (invite) => {
			queryClient.invalidateQueries({ queryKey: ['store', invite.store_id, 'invites'] });
		},
		onError: (error) => {
			console.error('Failed to revoke invite:', error);
		},
		retry: 3,
	});
}

export function useTemplateRoleOverrides(storeId: string | null) {
	return useQuery({
		queryKey: ['template-role-overrides', storeId],
		queryFn: () => fetchTemplateRoleOverrides(storeId!),
		enabled: !!storeId,
		staleTime: STORE_CACHE_TIME,
		retry: 3,
	});
}

export function useUpsertTemplateRoleOverride() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: {
			storeId: string;
			sheetTemplateId: string;
			storeRoleId: string;
			permissions: Partial<Record<StoreRolePermissionKey, boolean>>;
		}) => upsertTemplateRoleOverride(params),
		onSuccess: (_override, variables) => {
			queryClient.invalidateQueries({
				queryKey: ['template-role-overrides', variables.storeId],
			});
		},
		onError: (error) => {
			console.error('Failed to save template role override:', error);
		},
		retry: 3,
	});
}
