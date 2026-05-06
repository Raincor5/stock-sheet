import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/auth/client';
import {
	acceptPendingStoreInvites,
	fetchUserStoreMemberships,
	type StoreMembershipRecord,
} from '@/lib/api/stores';
import { hasManagementAccess } from '@/lib/permissions';

interface AuthContextValue {
	session: Session | null;
	user: User | null;
	role: string | null;
	storeId: string | null;
	memberships: StoreMembershipRecord[];
	isLoading: boolean;
	hasManagementAccess: boolean;
	refreshMemberships: () => Promise<void>;
	signUp: (email: string, password: string) => Promise<void>;
	signIn: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getPrimaryMembership(memberships: StoreMembershipRecord[]) {
	const ownerMembership = memberships.find((membership) => membership.roleSlug === 'owner');
	if (ownerMembership) {
		return ownerMembership;
	}

	const managerMembership = memberships.find((membership) =>
		hasManagementAccess(membership.permissions)
	);
	if (managerMembership) {
		return managerMembership;
	}

	return memberships[0] ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [role, setRole] = useState<string | null>(null);
	const [storeId, setStoreId] = useState<string | null>(null);
	const [memberships, setMemberships] = useState<StoreMembershipRecord[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasManagementAccessFlag, setHasManagementAccessFlag] = useState(false);

	useEffect(() => {
		supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
			setSession(activeSession);
			if (activeSession) {
				loadMemberships(activeSession.user.id, activeSession.user.email ?? '');
			} else {
				setIsLoading(false);
			}
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, activeSession) => {
			setSession(activeSession);
			if (activeSession) {
				loadMemberships(activeSession.user.id, activeSession.user.email ?? '');
			} else {
				setRole(null);
				setStoreId(null);
				setMemberships([]);
				setHasManagementAccessFlag(false);
				setIsLoading(false);
			}
		});

		return () => subscription.unsubscribe();
	}, []);

	async function loadMemberships(userId: string, email: string) {
		try {
			setIsLoading(true);

			if (email) {
				await acceptPendingStoreInvites(userId, email);
			}

			const membershipRows = await fetchUserStoreMemberships(userId);
			const primaryMembership = getPrimaryMembership(membershipRows);

			setMemberships(membershipRows);
			setRole(primaryMembership?.roleSlug ?? null);
			setStoreId(primaryMembership?.store_id ?? null);
			setHasManagementAccessFlag(
				membershipRows.some((membership) => hasManagementAccess(membership.permissions))
			);
		} catch (error) {
			console.error('Failed to load memberships:', error);
			setRole(null);
			setStoreId(null);
			setMemberships([]);
			setHasManagementAccessFlag(false);
		} finally {
			setIsLoading(false);
		}
	}

	const signUp = async (email: string, password: string) => {
		const { error } = await supabase.auth.signUp({ email, password });
		if (error) throw error;
	};

	const signIn = async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) throw error;
	};

	const signOut = async () => {
		await supabase.auth.signOut();
		setRole(null);
		setStoreId(null);
		setMemberships([]);
		setHasManagementAccessFlag(false);
	};

	const refreshMemberships = async () => {
		if (!session?.user) {
			return;
		}

		await loadMemberships(session.user.id, session.user.email ?? '');
	};

	return (
		<AuthContext.Provider
			value={{
				session,
				user: session?.user ?? null,
				role,
				storeId,
				memberships,
				isLoading,
				hasManagementAccess: hasManagementAccessFlag,
				refreshMemberships,
				signUp,
				signIn,
				signOut,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');
	return ctx;
}
