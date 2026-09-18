import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import AppLogo from './AppLogo';

interface PageLoadingOverlayProps {
  message?: string;
}

export const PageLoadingOverlay: React.FC<PageLoadingOverlayProps> = React.memo(() => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#25D4DE" />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 56, // Leave side navigation rail visible on the left
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40, // Below SideNav (zIndex 50/100)
  },
});

export default PageLoadingOverlay;
