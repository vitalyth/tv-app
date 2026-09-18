import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import AppLogo from './AppLogo';

export const AppSplashScreen: React.FC = React.memo(() => {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.gradientTop} pointerEvents="none" />
      <View style={styles.content}>
        <AppLogo size={96} />
        <Text style={styles.title}>TV App</Text>
        <Text style={styles.subtitle}>Loading...</Text>
        <ActivityIndicator size="small" color="#25D4DE" style={styles.spinner} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050607',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: '#17262A',
    opacity: 0.45,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: 'bold',
    marginTop: 18,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#B8C4CA',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '400',
  },
  spinner: {
    marginTop: 20,
    transform: [{ scale: 1.15 }],
  },
});

export default AppSplashScreen;
