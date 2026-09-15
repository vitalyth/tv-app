import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

interface ChannelLogoProps {
  url?: string | null;
  name?: string;
  size?: number;
}

export const ChannelLogo: React.FC<ChannelLogoProps> = ({ url, name, size = 28 }) => {
  const [hasError, setHasError] = useState(false);

  if (!url || hasError) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: Math.max(4, Math.floor(size / 5)) },
      ]}
    >
      <Image
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        onError={() => setHasError(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
