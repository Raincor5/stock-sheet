import { supabase } from './client';
import type { Database } from '../types/supabase';

type StoreMember = Database['public']['Tables']['store_members']['Row'];
type StoreMemberInsert = Database['public']['Tables']['store_members']['Insert'];
type StoreRole = Database['public']['Tables']['store_roles']['Row'];

export interface StoreMemberWithRole extends StoreMember {
	store_role?: StoreRole | null;
}

export async function getStoreMembers(storeId: string): Promise<StoreMemberWithRole[]> {
	const { data, error } = await supabase
		.from('store_members')
		.select('*, store_role:store_roles(*)')
		.eq('store_id', storeId);

	if (error) throw error;
	return (data as StoreMemberWithRole[]) || [];
}

export async function getStoreMemberById(memberId: string): Promise<StoreMemberWithRole | null> {
	const { data, error } = await supabase
		.from('store_members')
		.select('*, store_role:store_roles(*)')
		.eq('id', memberId)
		.single();

	if (error && error.code !== 'PGRST116') throw error;
	return (data as StoreMemberWithRole) || null;
}

export async function getUserRoleInStore(
	storeId: string,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('store_members')
		.select('store_role:store_roles(slug)')
		.eq('store_id', storeId)
		.eq('user_id', userId)
		.single();

	if (error && error.code !== 'PGRST116') throw error;

	const role = data as { store_role?: { slug?: string } | null } | null;
	return role?.store_role?.slug ?? null;
}

export async function addStoreMember(member: StoreMemberInsert): Promise<StoreMember> {
	const { data, error } = await supabase
		.from('store_members')
		.insert([member])
		.select()
		.single();

	if (error) throw error;
	return data;
}

export async function updateStoreMemberRole(
	memberId: string,
	roleId: string
): Promise<StoreMember> {
	const { data, error } = await supabase
		.from('store_members')
		.update({ role_id: roleId })
		.eq('id', memberId)
		.select()
		.single();

	if (error) throw error;
	return data;
}

export async function removeStoreMember(memberId: string): Promise<void> {
	const { error } = await supabase.from('store_members').delete().eq('id', memberId);

	if (error) throw error;
}
