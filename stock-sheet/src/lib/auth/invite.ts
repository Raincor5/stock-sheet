/**
 * Staff invitation helpers
 * Owned by auth-agent, invokes edge function owned by api-agent
 */

import { supabase } from './client';

export async function inviteStaff(email: string, storeId: string): Promise<void> {
	const { error } = await supabase.functions.invoke('invite-staff', {
		body: { email, storeId },
	});

	if (error) throw error;
}
