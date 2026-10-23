import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useForegroundPlaybackTimeout } from '../hooks/useForegroundPlaybackTimeout';
import { useMediaController } from '../media/MediaController';
import { MediaSurface } from '../media/MediaSurface';
import { RemoteImage } from './RemoteImage';
import {
  MULTIVIEW_MAX_HEIGHT,
  MULTIVIEW_MAX_BITRATE,
  type MultiViewTile,
} from '../media/player';
import { multiViewTileLayout } from '../media/multiViewLayout';
import { tvPlatform } from '../platform/runtime';

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

function ExtraMediaTile({
  entry,
  index,
  count,
  audioTile,
  paused,
}: {
  entry: MultiViewTile;
  index: number;
  count: number;
  audioTile: number;
  paused: boolean;
}) {
  const { markMultiViewPlaying, markMultiViewError, setPaused } =
    useMediaController();
  const { width, height } = useWindowDimensions();
  const latest = useRef({ index, markMultiViewPlaying, markMultiViewError });
  latest.current = { index, markMultiViewPlaying, markMultiViewError };
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const reportPlaying = useCallback(() => {
    if (mounted.current) {
      latest.current.markMultiViewPlaying(latest.current.index);
    }
  }, []);
  const reportError = useCallback(() => {
    if (mounted.current) {
      latest.current.markMultiViewError(latest.current.index);
    }
  }, []);
  useEffect(() => {
    if (entry.status !== 'loading' || paused) {
      return;
    }
    const timer = setTimeout(reportError, 25000);
    return () => clearTimeout(timer);
  }, [entry.status, paused, reportError]);
  return (
    <View
      testID={`multiview-extra-surface-${index}`}
      style={[
        multiViewTileLayout(index, count, width, height),
        styles.tileClip,
      ]}
    >
      {entry.status !== 'error' ? (
        <MediaSurface
          streamUrl={entry.stream.url}
          streamType={entry.stream.type}
          fallbackStreamUrl={entry.stream.fallbackUrl}
          fallbackStreamType={entry.stream.fallbackType}
          isLive
        disableAudioFocus
          paused={paused}
          isMuted={audioTile !== index}
          maxVideoHeight={MULTIVIEW_MAX_HEIGHT}
          maxBitRate={MULTIVIEW_MAX_BITRATE}
          resizeMode="contain"
          onFirstFrame={reportPlaying}
          onError={reportError}
          onPausedChange={audioTile === index ? setPaused : undefined}
        />
      ) : null}
    </View>
  );
}

export function MediaLayer() {
  const {
    item,
    stream,
    presentation,
    isFullscreen,
    status,
    paused,
    setPaused,
    selectedQualityId,
    markError,
    markPlaying,
    updateProgress,
    setAvailableQualities,
    registerSeekHandler,
    multiView,
  } = useMediaController();
  const { width, height } = useWindowDimensions();
  const tiled = presentation === 'multi-tile' && multiView !== null;
  const count = (multiView?.tiles.length ?? 0) + 1;
  const showVideo = status === 'playing' || (isFullscreen && Boolean(stream));
  useForegroundPlaybackTimeout(
    Boolean(item && stream && presentation !== 'background-image' && !paused),
  );

  useEffect(() => {
    console.info('[PlaybackTransition]', {
      item: item?.id,
      isFullscreen,
      presentation,
      status,
      hasStream: Boolean(stream),
    });
  }, [isFullscreen, item?.id, presentation, status, stream]);

  return (
    <View
      pointerEvents="none"
      style={[styles.layer, tiled && styles.tiledLayer]}
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

      {item &&
      stream &&
      presentation !== 'background-image' &&
      (!tiled || status !== 'error') ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            tiled && multiViewTileLayout(0, count, width, height),
            tiled && styles.tileClip,
            showVideo ? styles.videoVisible : styles.videoHidden,
          ]}
        >
          <MediaSurface
            key={stream.url}
            streamUrl={stream.url}
            streamType={stream.type}
            isLive={item.kind === 'live'}
            fallbackStreamUrl={stream.fallbackUrl}
            fallbackStreamType={stream.fallbackType}
            paused={paused}
            isMuted={tiled && multiView.audioTile !== 0}
            disableAudioFocus={tiled}
            maxVideoHeight={tiled ? MULTIVIEW_MAX_HEIGHT : undefined}
            maxBitRate={tiled ? MULTIVIEW_MAX_BITRATE : undefined}
            resizeMode={
              tiled || (isFullscreen && tvPlatform.id === 'android-tv')
                ? 'contain'
                : 'cover'
            }
            startPositionSeconds={
              item.kind === 'vod' && item.resumePositionMs
                ? item.resumePositionMs / 1000
                : undefined
            }
            selectedQualityId={tiled ? 'auto' : selectedQualityId}
            registerSeekHandler={registerSeekHandler}
            onFirstFrame={markPlaying}
            onError={markError}
            onPausedChange={
              !tiled || multiView.audioTile === 0 ? setPaused : undefined
            }
            onProgress={({
              currentTime,
              seekableDuration,
              seekableStart,
              seekableEnd,
            }) => {
              updateProgress(
                currentTime,
                seekableDuration,
                seekableStart,
                seekableEnd,
              );
            }}
            onVideoTracks={tracks => {
              setAvailableQualities(tracks);
            }}
          />
        </View>
      ) : null}
      {tiled
        ? multiView.tiles.map((entry, index) => (
            <ExtraMediaTile
              key={`${entry.item.id}:${entry.stream.url}`}
              entry={entry}
              index={index + 1}
              count={count}
              audioTile={multiView.audioTile}
              paused={paused}
            />
          ))
        : null}
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
  tiledLayer: { backgroundColor: '#000000' },
  tileClip: { borderRadius: 8, overflow: 'hidden' },
});
