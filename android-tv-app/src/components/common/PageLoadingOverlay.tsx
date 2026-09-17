import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import AppLogo from './AppLogo';

interface PageLoadingOverlayProps {
  message?: string;
}

export const PageLoadingOverlay: React.FC<PageLoadingOverlayProps> = React.memo(({
  message = 'טוען...',
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <AppLogo size={80} />
        <ActivityIndicator size="large" color="#25D4DE" style={styles.spinner} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginTop: 20,
  },
  text: {
    color: '#E0E6EA',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
});

export default PageLoadingOverlay;
