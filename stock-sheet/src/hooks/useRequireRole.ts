import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useUserRoleInStore } from '@/hooks/useStores';

/**
 * Guard hook to enforce session or global role-based access to screens.
 */
export function useRequireRole(required: 'authenticated' | 'manager' | 'staff') {
	const { session, role, isLoading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		if (isLoading) return;

		// No authenticated user
		if (!session) {
			if (pathname !== '/login') {
				router.replace('/login');
			}
			return;
		}

		// Any authenticated user can reach authenticated/staff routes.
		if (required === 'authenticated' || required === 'staff') {
			return;
		}

		// Manager routes remain restricted.
		if (required === 'manager' && role !== 'manager') {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
			return;
		}
	}, [session, role, isLoading, required, pathname, router]);
}

/**
 * Guard hook for screens where permissions depend on the selected store.
 */
export function useRequireStoreRole(
	storeId: string | null,
	required: 'manager' | 'staff'
) {
	const { session, user, isLoading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();
	const { data: storeRole, isLoading: isStoreRoleLoading } = useUserRoleInStore(
		storeId,
		user?.id ?? null
	);

	useEffect(() => {
		if (isLoading || isStoreRoleLoading) return;

		if (!session) {
			if (pathname !== '/login') {
				router.replace('/login');
			}
			return;
		}

		if (!storeId) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
			return;
		}

		if (!storeRole) {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
			return;
		}

		if (required === 'manager' && storeRole !== 'manager') {
			if (pathname !== '/sheet') {
				router.replace('/sheet');
			}
		}
	}, [isLoading, isStoreRoleLoading, pathname, required, router, session, storeId, storeRole]);

	return {
		storeRole,
		isStoreRoleLoading,
	};
}
