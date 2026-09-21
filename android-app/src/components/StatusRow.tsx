import {StyleSheet, Text, View} from 'react-native';

interface StatusRowProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'error';
}

export function StatusRow({label, value, tone = 'default'}: StatusRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === 'success' && styles.success, tone === 'error' && styles.error]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: 32, paddingVertical: 5},
  label: {color: '#91a3b7', fontSize: 16},
  value: {color: '#f4f7fb', fontSize: 16, fontWeight: '600', textAlign: 'right'},
  success: {color: '#55d68b'},
  error: {color: '#ff6b6b'},
});
