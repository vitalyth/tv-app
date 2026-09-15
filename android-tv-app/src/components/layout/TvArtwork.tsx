import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';

interface TvArtworkProps {
  imageUrl?: string | null;
  visible?: boolean;
}

export const TvArtwork: React.FC<TvArtworkProps> = React.memo(({
  imageUrl,
  visible = true,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl || null);
  const fadeAnim = React.useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (imageUrl && imageUrl !== currentUrl) {
      setCurrentUrl(imageUrl);
      fadeAnim.setValue(1);
    }
  }, [imageUrl, currentUrl, fadeAnim]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 150 : 250,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  if (!currentUrl) {
    return <View style={[StyleSheet.absoluteFill, styles.fallback]} pointerEvents="none" />;
  }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}
      pointerEvents="none"
    >
      <Image
        source={{ uri: currentUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#080A0C',
  },
});
