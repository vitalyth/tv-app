import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { VegaShakaPlayer } from '../../platforms/vega/src/media/vega/VegaShakaPlayer';
import type { MediaStreamType, VideoQualityOption } from './player';
import type { MediaSurfaceProps } from './MediaSurface.types';

declare const require: (moduleName: string) => any;

const {
  Video,
} = require('@amazon-devices/react-native-w3cmedia/dist/interface/Video');
const {
  KeplerVideoSurfaceView,
} = require('@amazon-devices/react-native-w3cmedia/dist/interface/KeplerVideoSurfaceView');
const {
  VideoPlayer,
} = require('@amazon-devices/react-native-w3cmedia/dist/headless');

interface SurfaceEngineProps {
  url: string;
  type?: MediaStreamType;
  paused?: boolean;
  isMuted?: boolean;
  maxVideoHeight?: number;
  maxBitRate?: number;
  resizeMode?: 'cover' | 'contain';
  startPositionSeconds?: number;
  selectedQualityId?: string;
  registerSeekHandler?: MediaSurfaceProps['registerSeekHandler'];
  onFirstFrame: () => void;
  onError: () => void;
  onPausedChange?: MediaSurfaceProps['onPausedChange'];
  onProgress?: (data: {
    currentTime: number;
    playableDuration: number;
    seekableDuration: number;
    seekableStart?: number;
    seekableEnd?: number;
  }) => void;
  onVideoTracks?: (tracks: VideoQualityOption[]) => void;
}

const MEDIA_RELEASE_DELAY_MS = 700;
const MEDIA_DEINITIALIZE_TIMEOUT_MS = 2_000;

let mediaTeardown = Promise.resolve();
let mediaReleaseUntil = 0;

function registerMediaTeardown(teardown?: Promise<unknown>) {
  mediaReleaseUntil = Date.now() + MEDIA_RELEASE_DELAY_MS;
  if (teardown) {
    mediaTeardown = mediaTeardown
      .then(() => teardown)
      .then(() => undefined)
      .catch(() => undefined);
  }
}

async function waitForMediaRelease() {
  await mediaTeardown;
  const remainingDelay = mediaReleaseUntil - Date.now();
  if (remainingDelay > 0) {
    await new Promise<void>(resolve => setTimeout(resolve, remainingDelay));
  }
}

function readSeekableRange(media: any): { start?: number; end?: number } {
  try {
    const seekable = media?.seekable;
    const length = Number(seekable?.length ?? 0);
    if (length > 0) {
      const start =
        typeof seekable.start === 'function' ? seekable.start(0) : undefined;
      const end =
        typeof seekable.end === 'function'
          ? seekable.end(length - 1)
          : undefined;
      return {
        start: Number.isFinite(start) ? start : undefined,
        end: Number.isFinite(end) ? end : undefined,
      };
    }
  } catch {
    // Some platform media objects expose partial seekable ranges.
  }
  return {};
}

function NativeHlsSurface({
  url,
  paused = false,
  isMuted = false,
  resizeMode = 'cover',
  startPositionSeconds,
  registerSeekHandler,
  onFirstFrame,
  onError,
  onPausedChange,
  onProgress,
}: SurfaceEngineProps) {
  const videoRef = useRef<any>(null);
  const videoInstance = useRef<any>(null);
  const firstFrameReported = useRef(false);
  const callbacksRef = useRef({ onFirstFrame, onProgress });

  callbacksRef.current = { onFirstFrame, onProgress };

  useEffect(() => {
    return registerSeekHandler?.(seconds => {
      if (videoRef.current) {
        console.info('[PlayerSeek] native seek', {
          seconds,
          current: videoRef.current.currentTime,
          range: readSeekableRange(videoRef.current),
        });
        videoRef.current.currentTime = seconds;
      }
    });
  }, [registerSeekHandler]);

  const handleRef = useCallback((node: any) => {
    videoRef.current = node;
    if (node) {
      videoInstance.current = node;
    }
  }, []);

  useEffect(() => {
    const reportPlaybackState = () => {
      const cur = videoRef.current?.currentTime ?? 0;
      const dur = videoRef.current?.duration ?? 0;
      const seekableRange = readSeekableRange(videoRef.current);
      if (!firstFrameReported.current && (cur > 0 || dur > 0)) {
        firstFrameReported.current = true;
        callbacksRef.current.onFirstFrame();
      }
      callbacksRef.current.onProgress?.({
        currentTime: cur,
        playableDuration: cur,
        seekableDuration:
          seekableRange.end !== undefined && seekableRange.start !== undefined
            ? Math.max(0, seekableRange.end - seekableRange.start)
            : dur,
        seekableStart: seekableRange.start,
        seekableEnd: seekableRange.end,
      });
    };

    const interval = setInterval(reportPlaybackState, 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      if (paused) {
        videoRef.current.pause?.();
      } else {
        videoRef.current.play?.();
      }
    }
  }, [paused]);

  useEffect(
    () => () => {
      const video = videoInstance.current;
      videoInstance.current = null;
      if (video) {
        try {
          video.pause?.();
          video.muted = true;
        } catch {
          // ignore
        }
      }
      registerMediaTeardown();
    },
    [],
  );

  return (
    <Video
      ref={handleRef}
      width={1920}
      height={1080}
      src={url}
      currentTime={
        startPositionSeconds && startPositionSeconds > 0
          ? startPositionSeconds
          : undefined
      }
      controls={false}
      autoplay={!paused}
      muted={isMuted}
      loop={false}
      scalingmode={resizeMode === 'contain' ? 'fit' : 'fill'}
      onCanPlay={() => {
        if (!firstFrameReported.current) {
          firstFrameReported.current = true;
          onFirstFrame();
        }
      }}
      onPlaying={() => {
        onPausedChange?.(false);
        if (!firstFrameReported.current) {
          firstFrameReported.current = true;
          onFirstFrame();
        }
      }}
      onPause={() => {
        if (videoInstance.current) {
          onPausedChange?.(Boolean(videoInstance.current.paused));
        }
      }}
      onError={onError}
      onEnded={onError}
    />
  );
}

function ShakaPlayerSurface({
  url,
  type = 'm3u8',
  paused = false,
  isMuted = false,
  maxVideoHeight,
  maxBitRate,
  resizeMode = 'cover',
  startPositionSeconds,
  selectedQualityId = 'auto',
  registerSeekHandler,
  onFirstFrame,
  onError,
  onPausedChange,
  onProgress,
  onVideoTracks,
}: SurfaceEngineProps) {
  const videoPlayer = useRef<any>(null);
  const shakaPlayer = useRef<VegaShakaPlayer | null>(null);
  const surfaceHandle = useRef<string | undefined>(undefined);
  const firstFrameReported = useRef(false);
  const destroyed = useRef(false);
  const teardown = useRef<Promise<void> | null>(null);
  const initialization = useRef<Promise<void> | null>(null);
  const settings = useRef({
    paused,
    isMuted,
    maxVideoHeight,
    maxBitRate,
    selectedQualityId,
  });
  settings.current = {
    paused,
    isMuted,
    maxVideoHeight,
    maxBitRate,
    selectedQualityId,
  };
  const playbackCallbacks = useRef({ onPausedChange });
  playbackCallbacks.current = { onPausedChange };

  useEffect(() => {
    return registerSeekHandler?.(seconds => {
      if (videoPlayer.current && !destroyed.current) {
        console.info('[PlayerSeek] shaka seek', {
          seconds,
          current: videoPlayer.current.currentTime,
          range: readSeekableRange(videoPlayer.current),
        });
        shakaPlayer.current?.seekTo(seconds);
      }
    });
  }, [registerSeekHandler]);

  const destroyPlayer = useCallback(() => {
    if (destroyed.current) {
      return teardown.current ?? Promise.resolve();
    }
    destroyed.current = true;
    const shaka = shakaPlayer.current;
    const player = videoPlayer.current;
    const handle = surfaceHandle.current;
    shakaPlayer.current = null;
    videoPlayer.current = null;
    surfaceHandle.current = undefined;

    if (player && handle) {
      player.clearSurfaceHandle(handle);
    }

    teardown.current = (async () => {
      try {
        await initialization.current?.catch(() => {});
        await shaka?.destroy();
      } finally {
        if (player) {
          player.pause?.();
          const result = player.deinitializeSync(MEDIA_DEINITIALIZE_TIMEOUT_MS);
          if (result !== 'success') {
            console.warn('[MediaSurface] Vega media deinitialize:', result);
          }
        }
        if ((globalThis as any).gmedia === player) {
          (globalThis as any).gmedia = null;
        }
      }
    })();
    registerMediaTeardown(teardown.current);
    return teardown.current;
  }, []);

  const onSurfaceViewCreated = useCallback(
    async (handle: string) => {
      if (destroyed.current) {
        return;
      }
      surfaceHandle.current = handle;
      const existingPlayer = videoPlayer.current;
      if (existingPlayer) {
        try {
          await initialization.current;
          if (!destroyed.current && videoPlayer.current === existingPlayer && surfaceHandle.current === handle) {
            existingPlayer.setSurfaceHandle(handle);
          }
        } catch (err) {
          console.warn('[MediaSurface] Vega surface reattach failed:', err);
          if (!destroyed.current) {
            onError();
          }
        }
        return;
      }
      const player = new VideoPlayer();
      videoPlayer.current = player;
      try {
        initialization.current = player.initialize();
        await initialization.current;
        if (destroyed.current) {
          return;
        }
        if (surfaceHandle.current) {
          player.setSurfaceHandle(surfaceHandle.current);
        }
        player.autoplay = !settings.current.paused;
        player.muted = settings.current.isMuted;
        const reportFirstFrame = () => {
          if (
            !destroyed.current &&
            videoPlayer.current === player &&
            !firstFrameReported.current
          ) {
            firstFrameReported.current = true;
            onFirstFrame();
          }
        };
        player.addEventListener('playing', reportFirstFrame);
        const reportPaused = () => {
          if (!destroyed.current && videoPlayer.current === player) {
            playbackCallbacks.current.onPausedChange?.(Boolean(player.paused));
          }
        };
        player.addEventListener('pause', reportPaused);
        player.addEventListener('playing', reportPaused);
        player.addEventListener('timeupdate', () => {
          if (destroyed.current || videoPlayer.current !== player) {
            return;
          }
          const cur = player.currentTime ?? 0;
          const dur = player.duration ?? 0;
          const seekableRange =
            shakaPlayer.current?.getSeekableRange() ??
            readSeekableRange(player);
          onProgress?.({
            currentTime: cur,
            playableDuration: cur,
            seekableDuration:
              seekableRange.end !== undefined &&
              seekableRange.start !== undefined
                ? Math.max(0, seekableRange.end - seekableRange.start)
                : dur,
            seekableStart: seekableRange.start,
            seekableEnd: seekableRange.end,
          });
        });
        const reportError = () => {
          if (!destroyed.current && videoPlayer.current === player) {
            onError();
          }
        };
        player.addEventListener('error', reportError);
        const shaka = new VegaShakaPlayer(player, reportError, qualities => {
          if (!destroyed.current && shakaPlayer.current === shaka) {
            onVideoTracks?.(qualities);
          }
        });
        shakaPlayer.current = shaka;
        shaka.setPlaybackLimits(
          settings.current.maxVideoHeight,
          settings.current.maxBitRate,
        );
        const streamType: 'm3u8' | 'mpd' =
          type === 'mpd' || url.includes('.mpd') ? 'mpd' : 'm3u8';
        try {
          console.info('[MediaSurface] Vega Shaka loading:', {
            type: streamType,
            url: url.slice(0, 100),
          });
          await shaka.load(url, streamType);
          if (destroyed.current) {
            return;
          }
          player.muted = settings.current.isMuted;
          if (settings.current.paused) {
            player.pause?.();
          }
          shaka.selectQuality(settings.current.selectedQualityId);
          if (startPositionSeconds && startPositionSeconds > 0) {
            const duration = player.duration ?? 0;
            player.currentTime =
              duration > 0
                ? Math.min(startPositionSeconds, duration - 1)
                : startPositionSeconds;
          }
          if (shakaPlayer.current) {
            const qualities = shaka.getQualities();
            onVideoTracks?.(qualities);
            setTimeout(() => {
              if (!destroyed.current && shakaPlayer.current === shaka) {
                onVideoTracks?.(shaka.getQualities());
              }
            }, 1500);
          }
        } catch (err) {
          console.warn('[MediaSurface] Vega Shaka load failed:', err);
          if (!destroyed.current) {
            onError();
          }
        }
      } catch (err) {
        console.warn('[MediaSurface] Vega initialization failed:', err);
        if (!destroyed.current) {
          onError();
        }
      }
    },
    [
      onError,
      onFirstFrame,
      onProgress,
      onVideoTracks,
      startPositionSeconds,
      type,
      url,
    ],
  );

  useEffect(() => {
    if (videoPlayer.current) {
      if (paused) {
        videoPlayer.current.pause?.();
      } else {
        videoPlayer.current.play?.();
      }
    }
  }, [paused]);

  useEffect(() => {
    if (videoPlayer.current) {
      videoPlayer.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    shakaPlayer.current?.setPlaybackLimits(maxVideoHeight, maxBitRate);
  }, [maxVideoHeight, maxBitRate]);

  useEffect(() => {
    if (shakaPlayer.current && selectedQualityId) {
      shakaPlayer.current.selectQuality(selectedQualityId);
    }
  }, [selectedQualityId]);

  useEffect(
    () => () => {
      destroyPlayer();
    },
    [destroyPlayer],
  );

  return (
    <KeplerVideoSurfaceView
      style={styles.surface}
      scalingmode={resizeMode === 'contain' ? 'fit' : 'fill'}
      onSurfaceViewCreated={onSurfaceViewCreated}
      onSurfaceViewDestroyed={(handle: string) => {
        if (surfaceHandle.current !== handle) {
          return;
        }
        if (videoPlayer.current) {
          videoPlayer.current.clearSurfaceHandle(handle);
        }
        surfaceHandle.current = undefined;
      }}
    />
  );
}

const FMP4_CONTAINER_PATTERNS = [
  'fmp4',
  'cmaf',
  '.mpd',
  '.ism',
  '.m4s',
  '.mp4',
];

function shouldUseShaka(url?: string, type?: MediaStreamType): boolean {
  if (!url) {
    return false;
  }
  if (type === 'mpd') {
    return true;
  }
  const lower = url.toLowerCase();
  // Formats and container patterns that require Shaka's MSE pipeline instead of native GStreamer:
  // - DASH manifests (.mpd)
  // - Fragmented MP4 / CMAF in HLS playlists
  // - Smooth Streaming (.ism) manifests
  // - ISOBMFF media segments (.m4s, .mp4)
  return FMP4_CONTAINER_PATTERNS.some(pattern => lower.includes(pattern));
}

export function MediaSurface({
  streamUrl,
  streamType,
  isLive = false,
  fallbackStreamUrl,
  fallbackStreamType,
  paused = false,
  isMuted = false,
  recoverVideoOnFocus = false,
  maxVideoHeight,
  maxBitRate,
  resizeMode = 'cover',
  startPositionSeconds,
  selectedQualityId = 'auto',
  registerSeekHandler,
  onFirstFrame,
  onError,
  onPausedChange,
  onProgress,
  onVideoTracks,
}: MediaSurfaceProps) {
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType,
  });
  const [recoveryGeneration, setRecoveryGeneration] = useState(0);
  const [mountedSource, setMountedSource] = useState<
    (typeof activeSource) & { generation: number }
  >();
  const [useShakaFallback, setUseShakaFallback] = useState(false);
  const usingFallback = useRef(false);
  const wasMuted = useRef(isMuted);

  useEffect(() => {
    const gainedFocus = wasMuted.current && !isMuted;
    wasMuted.current = isMuted;
    if (!recoverVideoOnFocus || !gainedFocus || paused) {
      return;
    }
    // Vega can report PLAYING while an older video plane is black. Reclaim it
    // after focus settles, without restarting the other tiles or rapid browsing.
    const timer = setTimeout(() => {
      console.info('[MultiViewFocusRecovery] recreating focused player');
      setRecoveryGeneration(previous => previous + 1);
    }, 650);
    return () => clearTimeout(timer);
  }, [isMuted, paused, recoverVideoOnFocus, streamUrl]);

  useEffect(() => {
    usingFallback.current = false;
    setUseShakaFallback(false);
    setActiveSource({ url: streamUrl, type: streamType });
  }, [streamType, streamUrl]);

  useEffect(() => {
    let active = true;
    setMountedSource(undefined);
    waitForMediaRelease().then(() => {
      if (active) {
        setMountedSource({ ...activeSource, generation: recoveryGeneration });
      }
    });
    return () => {
      active = false;
    };
  }, [activeSource, recoveryGeneration]);

  const handleError = useCallback(() => {
    if (
      !isLive &&
      !useShakaFallback &&
      !shouldUseShaka(activeSource.url, activeSource.type)
    ) {
      console.info(
        '[MediaSurface] Native HLS failed, falling back to Shaka Player',
      );
      setUseShakaFallback(true);
      return;
    }

    if (fallbackStreamUrl && !usingFallback.current) {
      usingFallback.current = true;
      setUseShakaFallback(false);
      setActiveSource({
        url: fallbackStreamUrl,
        type: fallbackStreamType,
      });
      return;
    }
    onError();
  }, [
    activeSource,
    isLive,
    fallbackStreamType,
    fallbackStreamUrl,
    onError,
    useShakaFallback,
  ]);

  if (!mountedSource || mountedSource.generation !== recoveryGeneration) {
    return <View pointerEvents="none" style={styles.surface} />;
  }

  const useShaka =
    isLive ||
    useShakaFallback ||
    shouldUseShaka(mountedSource.url, mountedSource.type);
  const Engine = useShaka ? ShakaPlayerSurface : NativeHlsSurface;

  return (
    <View pointerEvents="none" style={styles.surface}>
      <Engine
        key={`${mountedSource.url}-${useShaka ? 'shaka' : 'native'}`}
        url={mountedSource.url}
        type={mountedSource.type}
        paused={paused}
        isMuted={isMuted}
        maxVideoHeight={maxVideoHeight}
        maxBitRate={maxBitRate}
        resizeMode={resizeMode}
        startPositionSeconds={startPositionSeconds}
        selectedQualityId={selectedQualityId}
        registerSeekHandler={registerSeekHandler}
        onFirstFrame={onFirstFrame}
        onError={handleError}
        onPausedChange={onPausedChange}
        onProgress={onProgress}
        onVideoTracks={onVideoTracks}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
