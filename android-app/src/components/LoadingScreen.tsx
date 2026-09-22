import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

export function LoadingScreen() {
  return (
    <View accessibilityLabel="Application loading" style={styles.screen}>
      <Image
        source={require('../assets/tv-app-icon.png')}
        style={styles.icon}
      />
      <Text style={styles.brand}>
        app<Text style={styles.brandAccent}>TV</Text>
      </Text>
      <View style={styles.status}>
        <ActivityIndicator color="#ffffff" size="small" />
        <Text style={styles.loading}>Loading...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07111c',
  },
  icon: { width: 112, height: 112, borderRadius: 22 },
  brand: { color: '#ffffff', fontSize: 42, fontWeight: '800', marginTop: 22 },
  brandAccent: { color: '#5db5ff' },
  status: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  loading: { color: '#b8c7d3', fontSize: 18, marginLeft: 12 },
});
