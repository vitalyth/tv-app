import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import AppLogo from './AppLogo';

export const AppSplashScreen: React.FC = React.memo(() => {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.content}>
        <AppLogo size={96} />
        <Text style={styles.title}>מדריך תוכניות</Text>
        <Text style={styles.subtitle}>טוען לוח שידורים...</Text>
        <ActivityIndicator size="large" color="#25D4DE" style={styles.spinner} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 22,
    textAlign: 'center',
  },
  subtitle: {
    color: '#B8C4CA',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 24,
  },
});

export default AppSplashScreen;
