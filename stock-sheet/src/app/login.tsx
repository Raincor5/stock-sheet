import { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const { session, isLoading, signIn } = useAuth();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		if (!isLoading && session && pathname !== '/sheet') {
			router.replace('/sheet');
		}
	}, [isLoading, pathname, router, session]);

	const handleLogin = async () => {
		setError('');
		setLoading(true);

		try {
			await signIn(email, password);
			router.replace('/sheet');
		} catch (err: any) {
			setError(err.message || 'Login failed');
		} finally {
			setLoading(false);
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.form}>
				<Text style={styles.title}>Stock Sheet</Text>
				<Text style={styles.subtitle}>Login</Text>

				{error ? <Text style={styles.error}>{error}</Text> : null}

				<TextInput
					style={styles.input}
					placeholder="Email"
					value={email}
					onChangeText={setEmail}
					editable={!loading}
					autoCapitalize="none"
					keyboardType="email-address"
				/>

				<TextInput
					style={styles.input}
					placeholder="Password"
					value={password}
					onChangeText={setPassword}
					editable={!loading}
					secureTextEntry
				/>

				<TouchableOpacity
					style={[styles.button, loading && styles.buttonDisabled]}
					onPress={handleLogin}
					disabled={loading}
				>
					{loading ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.buttonText}>Sign In</Text>
					)}
				</TouchableOpacity>

				<View style={styles.footer}>
					<Text style={styles.footerText}>Don't have an account? </Text>
					<Link href="/register">
						<Text style={styles.link}>Sign Up</Text>
					</Link>
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		paddingHorizontal: 20,
		backgroundColor: '#f5f5f5',
	},
	form: {
		backgroundColor: '#fff',
		borderRadius: 8,
		padding: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	title: {
		fontSize: 28,
		fontWeight: 'bold',
		marginBottom: 8,
		textAlign: 'center',
		color: '#1c1c1e',
	},
	subtitle: {
		fontSize: 16,
		color: '#8e8e93',
		marginBottom: 20,
		textAlign: 'center',
	},
	input: {
		borderWidth: 1,
		borderColor: '#e5e5ea',
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 12,
		fontSize: 16,
		backgroundColor: '#f9f9f9',
	},
	button: {
		backgroundColor: '#007AFF',
		borderRadius: 6,
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 12,
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	buttonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	error: {
		color: '#d70015',
		marginBottom: 12,
		fontSize: 14,
	},
	footer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginTop: 20,
	},
	footerText: {
		color: '#8e8e93',
		fontSize: 14,
	},
	link: {
		color: '#007AFF',
		fontSize: 14,
		fontWeight: '600',
	},
});
