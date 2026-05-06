import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/auth/client';
import type { Session, User } from '@supabase/supabase-js';

type Role = 'manager' | 'staff' | null;

interface AuthContextValue {
	session: Session | null;
	user: User | null;
	role: Role;
	storeId: string | null;
	isLoading: boolean;
	signUp: (email: string, password: string) => Promise<void>;
	signIn: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [role, setRole] = useState<Role>(null);
	const [storeId, setStoreId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		// Check for existing session on mount
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			if (session) loadMembership(session.user.id);
			else setIsLoading(false);
		});

		// Listen for auth state changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session);
			if (session) loadMembership(session.user.id);
			else {
				setRole(null);
				setStoreId(null);
				setIsLoading(false);
			}
		});

		return () => subscription.unsubscribe();
	}, []);

	async function loadMembership(userId: string) {
		try {
			const { data, error } = await supabase
				.from('store_members')
				.select('role, store_id, created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: true });

			if (error) {
				throw error;
			}

			const memberships = data ?? [];
			const defaultMembership = memberships[0] ?? null;
			const hasManagerAccess = memberships.some((membership) => membership.role === 'manager');

			setRole(hasManagerAccess ? 'manager' : ((defaultMembership?.role as Role) ?? null));
			setStoreId(defaultMembership?.store_id ?? null);
		} catch (error) {
			console.error('Failed to load user role:', error);
			setRole(null);
			setStoreId(null);
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
	};

	return (
		<AuthContext.Provider
			value={{
				session,
				user: session?.user ?? null,
				role,
				storeId,
				isLoading,
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
