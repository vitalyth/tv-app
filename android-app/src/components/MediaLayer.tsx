import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, View } from 'react-native';
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
  const {
    item,
    stream,
    presentation,
    status,
    paused,
    selectedQualityId,
    markError,
    markPlaying,
    updateProgress,
    setAvailableQualities,
    registerSeekHandler,
  } = useMediaController();

  const isFullscreen = presentation === 'fullscreen';

  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      testID="persistent-media-layer"
    >
      {/* Backdrop image only on Home Screen / non-fullscreen mode */}
      {!isFullscreen && (item?.backdropUrl || item?.imageUrl) ? (
        <HeroBackdropImage
          key={item.backdropUrl ?? item.imageUrl!}
          uri={item.backdropUrl ?? item.imageUrl!}
          fallbackUri={item.fallbackImageUrl}
        />
      ) : null}

      {/* Centered Loading Spinner in Full Screen mode when video is not yet playing */}
      {isFullscreen && status !== 'playing' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : null}

      {item && stream && presentation !== 'background-image' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            status === 'playing' ? styles.videoVisible : styles.videoHidden,
          ]}
        >
          <MediaSurface
            key={`${item.id}:${stream.url}`}
            streamUrl={stream.url}
            streamType={stream.type}
            fallbackStreamUrl={stream.fallbackUrl}
            fallbackStreamType={stream.fallbackType}
            paused={paused}
            startPositionSeconds={
              item.kind === 'vod' && item.resumePositionMs
                ? item.resumePositionMs / 1000
                : undefined
            }
            selectedQualityId={selectedQualityId}
            registerSeekHandler={registerSeekHandler}
            onFirstFrame={markPlaying}
            onError={markError}
            onProgress={({ currentTime, seekableDuration }) => {
              updateProgress(currentTime, seekableDuration);
            }}
            onVideoTracks={tracks => {
              setAvailableQualities(tracks);
            }}
          />
        </View>
      ) : null}
      {!isFullscreen ? (
        <Image
          source={scrimComposite}
          style={StyleSheet.absoluteFill}
          resizeMode="stretch"
        />
      ) : null}
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
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07111c',
  },
});
