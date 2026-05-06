import { NativeModules, Platform } from 'react-native';

const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCALHOST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

type SourceCodeModule = {
	scriptURL?: string;
};

function getConfiguredSupabaseUrl() {
	return (
		process.env.EXPO_PUBLIC_SUPABASE_URL ||
		process.env.REACT_APP_SUPABASE_URL ||
		DEFAULT_SUPABASE_URL
	);
}

function getConfiguredSupabaseAnonKey() {
	return (
		process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
		process.env.REACT_APP_SUPABASE_ANON_KEY ||
		''
	);
}

function looksLikeReachableDevHost(host: string) {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith('.local');
}

function isPrivateIpv4Host(host: string) {
	if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
		return false;
	}

	const [firstOctet, secondOctet] = host.split('.').map((segment) => parseInt(segment, 10));

	return (
		firstOctet === 10 ||
		(firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
		(firstOctet === 192 && secondOctet === 168)
	);
}

function getMobileDevHost() {
	const configuredHostOverride =
		process.env.EXPO_PUBLIC_SUPABASE_LOCAL_HOST ||
		process.env.REACT_APP_SUPABASE_LOCAL_HOST ||
		'';

	if (configuredHostOverride.trim().length > 0) {
		return configuredHostOverride.trim();
	}

	const scriptURL = (NativeModules.SourceCode as SourceCodeModule | undefined)?.scriptURL;

	if (scriptURL) {
		try {
			const host = new URL(scriptURL).hostname;
			if (looksLikeReachableDevHost(host)) {
				return host;
			}
		} catch {
			// Fall through to platform-specific defaults below.
		}
	}

	if (Platform.OS === 'android') {
		return '10.0.2.2';
	}

	return null;
}

export function resolveSupabaseUrl(rawUrl: string = getConfiguredSupabaseUrl()) {
	try {
		const parsedUrl = new URL(rawUrl);
		const mobileDevHost = getMobileDevHost();
		const shouldRewriteLocalDevHost =
			Platform.OS !== 'web' &&
			mobileDevHost &&
			(LOCALHOST_HOSTS.has(parsedUrl.hostname) || isPrivateIpv4Host(parsedUrl.hostname));

		if (!shouldRewriteLocalDevHost) {
			return parsedUrl.toString();
		}

		parsedUrl.hostname = mobileDevHost;
		return parsedUrl.toString();
	} catch {
		return rawUrl;
	}
}

export function getSupabaseConfig() {
	return {
		supabaseUrl: resolveSupabaseUrl(),
		supabaseAnonKey: getConfiguredSupabaseAnonKey(),
	};
}
