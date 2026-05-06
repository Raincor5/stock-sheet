/**
 * Supabase Client Instance
 * Singleton used across the app for all database and edge function calls
 * Configured with SecureStore for token persistence on mobile
 * Owned by auth-agent for session management
 */

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@/types/supabase';

const supabaseUrl =
	process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';

const SECURE_STORE_CHUNK_SIZE = 1800;
const FALLBACK_SECURE_STORE_KEY = 'supabase.auth.token';

function normalizeSecureStoreKey(key: string) {
	const baseKey = key.trim().length > 0 ? key.trim() : FALLBACK_SECURE_STORE_KEY;
	return baseKey.replace(/[^A-Za-z0-9._-]/g, '_');
}

const getChunkCountKey = (key: string) => `${normalizeSecureStoreKey(key)}.chunk_count`;
const getChunkKey = (key: string, index: number) => `${normalizeSecureStoreKey(key)}.chunk_${index}`;
const getBaseStorageKey = (key: string) => normalizeSecureStoreKey(key);

async function removeChunkedValue(key: string) {
	const chunkCountValue = await SecureStore.getItemAsync(getChunkCountKey(key));
	const chunkCount = chunkCountValue ? parseInt(chunkCountValue, 10) : 0;

	await SecureStore.deleteItemAsync(getBaseStorageKey(key));
	await SecureStore.deleteItemAsync(getChunkCountKey(key));

	if (Number.isNaN(chunkCount) || chunkCount <= 0) {
		return;
	}

	await Promise.all(
		Array.from({ length: chunkCount }, (_, index) =>
			SecureStore.deleteItemAsync(getChunkKey(key, index))
		)
	);
}

// SecureStore adapter for token persistence on mobile.
// Large auth payloads are chunked to stay under iOS SecureStore size limits.
const ExpoSecureStoreAdapter = {
	async getItem(key: string) {
		const chunkCountValue = await SecureStore.getItemAsync(getChunkCountKey(key));
		const chunkCount = chunkCountValue ? parseInt(chunkCountValue, 10) : 0;

		if (chunkCountValue && !Number.isNaN(chunkCount) && chunkCount > 0) {
			const chunks = await Promise.all(
				Array.from({ length: chunkCount }, (_, index) =>
					SecureStore.getItemAsync(getChunkKey(key, index))
				)
			);

			if (chunks.some((chunk) => chunk === null)) {
				return null;
			}

			return chunks.join('');
		}

		return SecureStore.getItemAsync(getBaseStorageKey(key));
	},
	async setItem(key: string, value: string) {
		await removeChunkedValue(key);

		if (value.length <= SECURE_STORE_CHUNK_SIZE) {
			await SecureStore.setItemAsync(getBaseStorageKey(key), value);
			return;
		}

		const chunks = Array.from(
			{ length: Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE) },
			(_, index) =>
				value.slice(
					index * SECURE_STORE_CHUNK_SIZE,
					(index + 1) * SECURE_STORE_CHUNK_SIZE
				)
		);

		await SecureStore.setItemAsync(getChunkCountKey(key), String(chunks.length));
		await Promise.all(
			chunks.map((chunk, index) => SecureStore.setItemAsync(getChunkKey(key, index), chunk))
		);
	},
	removeItem(key: string) {
		return removeChunkedValue(key);
	},
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: Platform.OS !== 'web' ? ExpoSecureStoreAdapter : undefined,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: Platform.OS === 'web',
	},
});
