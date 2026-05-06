import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, type StoreRolePermissionKey } from '@/lib/permissions';
import { useStoreMembership } from '@/hooks/useStores';

export function useRequireRole(required: 'authenticated' | 'manager' | 'staff') {
	const { session, hasManagementAccess, isLoading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		if (isLoading) return;

		if (!session) {
			if (pathname !== '/login') {
				router.replace('/login');
			}
			return;
		}

		if (required === 'authenticated' || required === 'staff') {
			return;
		}

		if (required === 'manager' && !hasManagementAccess) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
		}
	}, [hasManagementAccess, isLoading, pathname, required, router, session]);
}

export function useRequireStoreRole(storeId: string | null, required: 'manager' | 'staff') {
	const { session, user, isLoading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();
	const { data: membership, isLoading: isMembershipLoading } = useStoreMembership(
		storeId,
		user?.id ?? null
	);

	useEffect(() => {
		if (isLoading || isMembershipLoading) return;

		if (!session) {
			if (pathname !== '/login') {
				router.replace('/login');
			}
			return;
		}

		if (!storeId || !membership) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
			return;
		}

		if (required === 'manager' && !membership.permissions.manageTemplates) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
		}
	}, [isLoading, isMembershipLoading, membership, pathname, required, router, session, storeId]);

	return {
		storeRole: membership?.roleSlug ?? null,
		storeMembership: membership ?? null,
		isStoreRoleLoading: isMembershipLoading,
	};
}

export function useRequireStorePermission(
	storeId: string | null,
	requiredPermission: StoreRolePermissionKey
) {
	const { session, user, isLoading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();
	const { data: membership, isLoading: isMembershipLoading } = useStoreMembership(
		storeId,
		user?.id ?? null
	);

	useEffect(() => {
		if (isLoading || isMembershipLoading) return;

		if (!session) {
			if (pathname !== '/login') {
				router.replace('/login');
			}
			return;
		}

		if (!storeId || !membership || !hasPermission(membership.permissions, requiredPermission)) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
		}
	}, [
		isLoading,
		isMembershipLoading,
		membership,
		pathname,
		requiredPermission,
		router,
		session,
		storeId,
	]);

	return {
		storeMembership: membership ?? null,
		isStorePermissionLoading: isMembershipLoading,
	};
}
