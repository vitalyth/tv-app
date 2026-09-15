import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { resolveImageUrl } from '../../services/api';

interface TvArtworkProps {
  imageUrl?: string | null;
  visible?: boolean;
}

export const TvArtwork: React.FC<TvArtworkProps> = React.memo(({
  imageUrl,
  visible = true,
}) => {
  const highResUrl = imageUrl ? resolveImageUrl(imageUrl, true) : null;
  const [currentUrl, setCurrentUrl] = useState<string | null>(highResUrl || null);
  const [isRendered, setIsRendered] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  // Keep currentUrl in sync with highResUrl
  useEffect(() => {
    if (highResUrl && highResUrl !== currentUrl) {
      setCurrentUrl(highResUrl);
    }
  }, [highResUrl, currentUrl]);

  // Visibility transitions: fade in / fade out smoothly
  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });
    }
  }, [visible, fadeAnim]);

  // When not visible and fade-out is complete, render NOTHING so the video player is completely exposed
  if (!visible && !isRendered) {
    return null;
  }

  // If visible but no image URL, show dark fallback
  if (!currentUrl) {
    if (!visible) return null;
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

