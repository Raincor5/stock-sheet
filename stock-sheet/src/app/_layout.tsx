import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/api/queryClient';

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<StatusBar style="dark" />
			<AuthProvider>
				<QueryClientProvider client={queryClient}>
					<Stack screenOptions={{ headerShown: false }} />
				</QueryClientProvider>
			</AuthProvider>
		</SafeAreaProvider>
	);
}
