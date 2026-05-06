import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRequireRole } from '@/hooks/useRequireRole';

export default function ProductsScreen() {
	useRequireRole('staff');

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Products</Text>
				<Text style={styles.subtitle}>Coming soon...</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	content: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {
		fontSize: 24,
		fontWeight: '600',
		color: '#1c1c1e',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: '#8e8e93',
	},
});
