import { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useMediaController } from '../media/MediaController';
import { MediaSurface } from '../media/MediaSurface';
import { RemoteImage } from './RemoteImage';

interface HeroBackdropImageProps {
  uri: string;
  fallbackUri?: string;
}

function HeroBackdropImage({ uri, fallbackUri }: HeroBackdropImageProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hasFaded = useRef(false);

  const fadeIn = useCallback(() => {
    if (hasFaded.current) {
      return;
    }
    hasFaded.current = true;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    // Safety fallback: if onLoad does not fire within 500ms, fade in anyway
    const timer = setTimeout(fadeIn, 500);
    return () => clearTimeout(timer);
  }, [fadeIn]);

  return (
    <Animated.View style={[styles.poster, { opacity: fadeAnim }]}>
      <RemoteImage
        uri={uri}
        fallbackUri={fallbackUri}
        resizeMode="cover"
        style={styles.poster}
        onLoad={fadeIn}
      />
    </Animated.View>
  );
}

export function MediaLayer() {
  const { item, stream, presentation, status, markError, markPlaying } =
    useMediaController();

  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      testID="persistent-media-layer"
    >
      {item && stream && presentation !== 'background-image' ? (
        <MediaSurface
          streamUrl={stream.url}
          streamType={stream.type}
          fallbackStreamUrl={stream.fallbackUrl}
          fallbackStreamType={stream.fallbackType}
          onFirstFrame={markPlaying}
          onError={markError}
        />
      ) : (
        <>
          <View style={styles.light} />
          <View style={styles.horizon} />
        </>
      )}
      {(item?.backdropUrl || item?.imageUrl) &&
      (presentation === 'background-image' || status !== 'playing') ? (
        <HeroBackdropImage
          key={item.backdropUrl ?? item.imageUrl!}
          uri={item.backdropUrl ?? item.imageUrl!}
          fallbackUri={item.fallbackImageUrl}
        />
      ) : null}
      <View style={styles.scrim} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111b25',
    overflow: 'hidden',
  },
  light: {
    position: 'absolute',
    right: -80,
    top: -120,
    width: '58%',
    height: '78%',
    borderRadius: 320,
    backgroundColor: '#294d60',
    opacity: 0.5,
  },
  horizon: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '46%',
    backgroundColor: '#12232e',
  },
  poster: { ...StyleSheet.absoluteFillObject },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 14, 0.48)',
  },
});
