import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { VegaShakaPlayer } from '../../platforms/vega/src/media/vega/VegaShakaPlayer';
import type { MediaStreamType, VideoQualityOption } from './player';
import type { MediaSurfaceProps } from './MediaSurface.types';

declare const require: (moduleName: string) => any;

const { Video } = require(
  '@amazon-devices/react-native-w3cmedia/dist/interface/Video',
);
const { KeplerVideoSurfaceView } = require(
  '@amazon-devices/react-native-w3cmedia/dist/interface/KeplerVideoSurfaceView',
);
const { VideoPlayer } = require(
  '@amazon-devices/react-native-w3cmedia/dist/headless',
);

interface SurfaceEngineProps {
  url: string;
  type?: MediaStreamType;
  paused?: boolean;
  startPositionSeconds?: number;
  selectedQualityId?: string;
  onFirstFrame: () => void;
  onError: () => void;
  onProgress?: (data: {
    currentTime: number;
    playableDuration: number;
    seekableDuration: number;
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

function NativeHlsSurface({
  url,
  paused = false,
  startPositionSeconds,
  onFirstFrame,
  onError,
  onProgress,
}: SurfaceEngineProps) {
  const videoRef = useRef<any>(null);
  const videoInstance = useRef<any>(null);
  const firstFrameReported = useRef(false);
  const callbacksRef = useRef({ onFirstFrame, onProgress });

  callbacksRef.current = { onFirstFrame, onProgress };

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
      if (!firstFrameReported.current && cur > 0) {
        firstFrameReported.current = true;
        callbacksRef.current.onFirstFrame();
      }
      callbacksRef.current.onProgress?.({
        currentTime: cur,
        playableDuration: cur,
        seekableDuration: dur,
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
      muted={false}
      loop={false}
      scalingmode="fill"
      onError={onError}
      onEnded={onError}
    />
  );
}

function ShakaPlayerSurface({
  url,
  type = 'mpd',
  paused = false,
  startPositionSeconds,
  selectedQualityId = 'auto',
  onFirstFrame,
  onError,
  onProgress,
  onVideoTracks,
}: SurfaceEngineProps) {
  const videoPlayer = useRef<any>(null);
  const shakaPlayer = useRef<VegaShakaPlayer | null>(null);
  const surfaceHandle = useRef<string | undefined>(undefined);
  const firstFrameReported = useRef(false);
  const destroyed = useRef(false);
  const teardown = useRef<Promise<void> | null>(null);

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
        await shaka?.destroy();
      } finally {
        if (player) {
          player.pause?.();
          const result = player.deinitializeSync(
            MEDIA_DEINITIALIZE_TIMEOUT_MS,
          );
          if (result !== 'success') {
            console.warn('[MediaSurface] Vega media deinitialize:', result);
          }
        }
        (globalThis as any).gmedia = null;
      }
    })();
    registerMediaTeardown(teardown.current);
    return teardown.current;
  }, []);

  const onSurfaceViewCreated = useCallback(
    async (handle: string) => {
      if (videoPlayer.current || destroyed.current) {
        return;
      }
      surfaceHandle.current = handle;
      const player = new VideoPlayer();
      videoPlayer.current = player;
      await player.initialize();
      if (destroyed.current) {
        return;
      }
      player.setSurfaceHandle(handle);
      player.autoplay = true;
      player.addEventListener('timeupdate', () => {
        const cur = player.currentTime ?? 0;
        const dur = player.duration ?? 0;
        if (!firstFrameReported.current && cur > 0) {
          firstFrameReported.current = true;
          onFirstFrame();
        }
        onProgress?.({
          currentTime: cur,
          playableDuration: cur,
          seekableDuration: dur,
        });
      });
      player.addEventListener('error', onError);
      const shaka = new VegaShakaPlayer(player, onError);
      shakaPlayer.current = shaka;
      const streamType: 'm3u8' | 'mpd' =
        type === 'mpd' || url.includes('.mpd') ? 'mpd' : 'm3u8';
      try {
        console.info('[MediaSurface] Vega Shaka loading:', {
          type: streamType,
          url: url.slice(0, 100),
        });
        await shaka.load(url, streamType);
        if (startPositionSeconds && startPositionSeconds > 0) {
          const duration = player.duration ?? 0;
          player.currentTime = duration > 0
            ? Math.min(startPositionSeconds, duration - 1)
            : startPositionSeconds;
        }
        if (shakaPlayer.current) {
          const qualities = shaka.getQualities();
          onVideoTracks?.(qualities);
        }
      } catch (err) {
        console.warn('[MediaSurface] Vega Shaka load failed:', err);
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
      scalingmode="fill"
      onSurfaceViewCreated={onSurfaceViewCreated}
      onSurfaceViewDestroyed={(handle: string) => {
        if (videoPlayer.current) {
          videoPlayer.current.clearSurfaceHandle(handle);
        }
        surfaceHandle.current = undefined;
        destroyPlayer();
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
  fallbackStreamUrl,
  fallbackStreamType,
  paused = false,
  startPositionSeconds,
  selectedQualityId = 'auto',
  onFirstFrame,
  onError,
  onProgress,
  onVideoTracks,
}: MediaSurfaceProps) {
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType,
  });
  const [mountedSource, setMountedSource] = useState<typeof activeSource>();
  const [useShakaFallback, setUseShakaFallback] = useState(false);
  const usingFallback = useRef(false);

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
        setMountedSource(activeSource);
      }
    });
    return () => {
      active = false;
    };
  }, [activeSource]);

  const handleError = useCallback(() => {
    if (
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
    fallbackStreamType,
    fallbackStreamUrl,
    onError,
    useShakaFallback,
  ]);

  if (!mountedSource) {
    return <View pointerEvents="none" style={styles.surface} />;
  }

  const useShaka =
    useShakaFallback || shouldUseShaka(mountedSource.url, mountedSource.type);
  const Engine = useShaka ? ShakaPlayerSurface : NativeHlsSurface;

  return (
    <View pointerEvents="none" style={styles.surface}>
      <Engine
        key={`${mountedSource.url}-${useShaka ? 'shaka' : 'native'}`}
        url={mountedSource.url}
        type={mountedSource.type}
        paused={paused}
        startPositionSeconds={startPositionSeconds}
        selectedQualityId={selectedQualityId}
        onFirstFrame={onFirstFrame}
        onError={handleError}
        onProgress={onProgress}
        onVideoTracks={onVideoTracks}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
