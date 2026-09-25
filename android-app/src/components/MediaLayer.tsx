import { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useMediaController } from '../media/MediaController';
import { MediaSurface } from '../media/MediaSurface';
import { RemoteImage } from './RemoteImage';

const scrimComposite = require('../assets/scrim_composite.png');

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
      {item?.backdropUrl || item?.imageUrl ? (
        <HeroBackdropImage
          key={item.backdropUrl ?? item.imageUrl!}
          uri={item.backdropUrl ?? item.imageUrl!}
          fallbackUri={item.fallbackImageUrl}
        />
      ) : null}
      {item && stream && presentation !== 'background-image' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            status === 'playing' ? styles.videoVisible : styles.videoHidden,
          ]}
        >
          <MediaSurface
            streamUrl={stream.url}
            streamType={stream.type}
            fallbackStreamUrl={stream.fallbackUrl}
            fallbackStreamType={stream.fallbackType}
            onFirstFrame={markPlaying}
            onError={markError}
          />
        </View>
      ) : null}
      <Image
        source={scrimComposite}
        style={StyleSheet.absoluteFill}
        resizeMode="stretch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07111c',
    overflow: 'hidden',
  },
  poster: { ...StyleSheet.absoluteFillObject },
  videoVisible: { opacity: 1 },
  videoHidden: { opacity: 0 },
});
