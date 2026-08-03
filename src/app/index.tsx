import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Placeholder shell. The real map screen arrives in phase 4; this exists only so
 * `expo start` boots on both platforms while phases 0-1 build the data and engine.
 */
export default function MapScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.wordmark}>CURB</Text>
        <Text style={styles.tagline}>Ann Arbor parking, by the clock.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  tagline: { fontSize: 15, opacity: 0.6 },
});
