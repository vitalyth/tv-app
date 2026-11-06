import {useChannelDrawerViewport} from '../hooks/useChannelDrawerViewport';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useForegroundPlaybackTimeout } from '../hooks/useForegroundPlaybackTimeout';
import { useMediaActions, useMediaController } from '../media/MediaController';
import { RecoveringMediaSurface } from '../media/RecoveringMediaSurface';
import { MultiViewSurface } from '../media/MultiViewSurface';
import { RemoteImage } from './RemoteImage';
import {
  MULTIVIEW_MAX_HEIGHT,
  type MultiViewTile,
} from '../media/player';
import type {MediaSurfaceProps} from '../media/MediaSurface.types';
import { multiViewBitrateLimit } from '../media/multiViewLayout';
import {MultiViewTileFrame} from './player/MultiViewTileFrame';
import {createMultiViewSession, registerMultiViewSession, multiViewSessionKey} from '../media/multiViewSessions';
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

// The regular player surface also renders Multi View. Only compact previews
// receive playback limits; promoting a stream preserves its player and source.
const PlayerMediaSurface = memo(function PlayerMediaSurfaceContent({
  entry, index, tiled, compact, count, isMuted, paused, resizeMode, primaryControls, mainControls,
}: {
  entry: MultiViewTile;
  index: number;
  tiled: boolean;
  compact: boolean;
  count: number;
  isMuted: boolean;
  paused: boolean;
  resizeMode: 'contain' | 'cover';
  primaryControls?: Partial<MediaSurfaceProps>;
  mainControls?: Pick<MediaSurfaceProps, 'selectedSubtitleId' | 'onSubtitleTracks'>;
}) {
  const media = useMediaActions();
  const latest = useRef({index, media, paused, primaryControls});
  latest.current = {index, media, paused, primaryControls};
  const [tilePaused, setTilePaused] = useState(false);
  const [tileQuality, setTileQuality] = useState(primaryControls?.selectedQualityId ?? 'auto');
  useEffect(() => {
    if (!tiled) setTileQuality(primaryControls?.selectedQualityId ?? 'auto');
  }, [tiled, primaryControls?.selectedQualityId]);
  const nativeSeek = useRef<((seconds: number) => void) | null>(null);
  const [session] = useState(() => createMultiViewSession({
    seekTo: seconds => nativeSeek.current?.(seconds),
    togglePaused: () => {
      if (latest.current.paused) {
        latest.current.media.setPaused(false);
        setTilePaused(false);
      } else setTilePaused(value => !value);
    },
    setQuality: setTileQuality,
  }));
  const wasTiled = useRef(tiled);
  useEffect(() => {
    if (wasTiled.current && !tiled) {
      media.setPaused(paused || tilePaused);
      media.setSelectedQuality(tileQuality);
      setTilePaused(false);
    }
    wasTiled.current = tiled;
  }, [tiled, media, paused, tilePaused, tileQuality]);
  const sessionKey = multiViewSessionKey(entry.item, entry.stream);
  useEffect(() => registerMultiViewSession(sessionKey, session), [sessionKey, session]);
  useEffect(() => {
    session.update({paused: paused || tilePaused, selectedQualityId: tiled ? tileQuality : primaryControls?.selectedQualityId ?? 'auto'});
  }, [session, paused, tilePaused, tileQuality, tiled, primaryControls?.selectedQualityId]);
  const registerSeek = useCallback((seek: (seconds: number) => void) => {
    nativeSeek.current = seek;
    const release = latest.current.primaryControls?.registerSeekHandler?.(seek);
    return () => {
      if (nativeSeek.current === seek) nativeSeek.current = null;
      release?.();
    };
  }, [primaryControls?.registerSeekHandler]);
  const reportProgress = useCallback<NonNullable<MediaSurfaceProps['onProgress']>>(data => {
    session.update({currentTime: data.currentTime, duration: data.seekableDuration,
      seekableStart: data.seekableStart ?? 0, seekableEnd: data.seekableEnd ?? 0});
    latest.current.primaryControls?.onProgress?.(data);
  }, [session]);
  const reportTracks = useCallback<NonNullable<MediaSurfaceProps['onVideoTracks']>>(tracks => {
    session.update({videoQualities: tracks});
    latest.current.primaryControls?.onVideoTracks?.(tracks);
  }, [session]);
  useEffect(() => {
    const tracks = session.getSnapshot().videoQualities;
    if (tracks.length) primaryControls?.onVideoTracks?.(tracks);
  }, [session, primaryControls?.onVideoTracks]);
  const mounted = useRef(true);
  useEffect(() => () => {mounted.current = false;}, []);
  const reportPlaying = useCallback(() => {
    if (!mounted.current) return;
    const current = latest.current;
    if (current.index === 0) current.media.markPlaying();
    else current.media.markMultiViewPlaying(current.index);
  }, []);
  const reportError = useCallback(() => {
    if (!mounted.current) return;
    const current = latest.current;
    if (current.index === 0) current.media.markError();
    else current.media.markMultiViewError(current.index);
  }, []);
  return <RecoveringMediaSurface
    item={entry.item} stream={entry.stream}
    disableAudioFocus={tiled} preferSurfaceView={compact ? true : undefined}
    recoverVideoOnFocus={compact && count > 2}
    isMuted={isMuted}
    maxVideoHeight={compact ? MULTIVIEW_MAX_HEIGHT : undefined}
    maxBitRate={compact ? multiViewBitrateLimit(count) : undefined}
    resizeMode={resizeMode}
    onFirstFrame={reportPlaying} onError={reportError}
    onPausedChange={isMuted ? undefined : media.setPaused}
    {...primaryControls}
    selectedSubtitleId={compact ? 'off' : mainControls?.selectedSubtitleId}
    onSubtitleTracks={compact ? undefined : mainControls?.onSubtitleTracks}
    paused={paused || tilePaused}
    selectedQualityId={tiled ? tileQuality : primaryControls?.selectedQualityId}
    registerSeekHandler={registerSeek}
    onProgress={reportProgress} onVideoTracks={reportTracks}
  />;
});

export function MediaLayer({channelDrawerOpen = false}: {channelDrawerOpen?: boolean}) {
  const {
    item,
    stream,
    presentation,
    isFullscreen,
    status,
    paused,
    setPaused,
    selectedQualityId,
    selectedSubtitleId,
    setSubtitleTracks,
    markError,
    markPlaying,
    updateProgress,
    setAvailableQualities,
    registerSeekHandler,
    multiView,
    markMultiViewPlaying,
    markMultiViewError,
  } = useMediaController();
  const { width, height } = useWindowDimensions();
  const tiled = presentation === 'multi-tile' && multiView !== null;
  const software = tiled && multiView.backend === 'software';
  const drawerVideoStyle = useChannelDrawerViewport(channelDrawerOpen && isFullscreen);
  const count = (multiView?.tiles.length ?? 0) + 1;
  const activeTile = Math.max(0, Math.min(count - 1, multiView?.activeTile ?? 0));
  const mainItem = activeTile === 0 ? item : multiView?.tiles[activeTile - 1]?.item;
  const mainStream = activeTile === 0 ? stream : multiView?.tiles[activeTile - 1]?.stream;
  const mainKey = mainItem && mainStream ? multiViewSessionKey(mainItem, mainStream) : '';
  const reportMainSubtitles = useCallback((tracks: Parameters<typeof setSubtitleTracks>[0]) =>
    setSubtitleTracks(tracks, mainKey), [setSubtitleTracks, mainKey]);
  const mainControls = useMemo(() => ({selectedSubtitleId, onSubtitleTracks: reportMainSubtitles}),
    [selectedSubtitleId, reportMainSubtitles]);
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

      <Animated.View
        testID="player-viewport"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, isFullscreen && drawerVideoStyle]}
      >
      {item && stream && !software && presentation !== 'background-image'
        ? [{item, stream, status}, ...(tiled ? multiView.tiles : [])].map((entry, index) => (
          <MultiViewTileFrame
            key={`${entry.item.id}:${entry.stream.sourceId ?? ''}:${entry.stream.url}`}
            index={index} count={count} activeTile={activeTile} width={width} height={height}
            active={tiled} fullCanvas={index === 0}
            testID={index === 0 ? 'player-video-frame' : `multiview-extra-surface-${index}`}
            style={[tiled && styles.tileClip, index !== 0 || showVideo ? styles.videoVisible : styles.videoHidden]}
          >
            {!tiled || entry.status !== 'error' ? <PlayerMediaSurface
              entry={entry} index={index} tiled={tiled} compact={tiled && index !== activeTile} count={count}
              mainControls={!tiled || index === activeTile ? mainControls : undefined}
              isMuted={tiled && multiView.audioTile !== index}
              paused={paused}
              resizeMode={tiled || (isFullscreen && tvPlatform.id === 'android-tv') ? 'contain' : 'cover'}
              primaryControls={index === 0 ? {
                startPositionSeconds: item.kind === 'vod' && item.resumePositionMs ? item.resumePositionMs / 1000 : undefined,
                selectedQualityId: tiled ? 'auto' : selectedQualityId,
                registerSeekHandler,
                onProgress: data => updateProgress(data.currentTime, data.seekableDuration, data.seekableStart, data.seekableEnd),
                onVideoTracks: setAvailableQualities,
              } : undefined}
            /> : null}
          </MultiViewTileFrame>
        )) : null}
      {software && stream ? (
        <MultiViewSurface
          streams={[stream, ...multiView.tiles.map(entry => entry.stream)]}
          audioTile={multiView.audioTile}
          paused={paused}
          onTileState={(index, state) => {
            if (state === 'playing') {
              if (index === 0) {
                markPlaying();
              } else {
                markMultiViewPlaying(index);
              }
            } else if (state === 'error') {
              if (index === 0) {
                markError();
              } else {
                markMultiViewError(index);
              }
            }
          }}
        />
      ) : null}
      </Animated.View>
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
  tileClip: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#121b27' },
});
