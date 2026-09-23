import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { VegaShakaPlayer } from '../../platforms/vega/src/media/vega/VegaShakaPlayer';
import type { MediaStreamType } from './player';
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
  onFirstFrame: () => void;
  onError: () => void;
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
  onFirstFrame,
  onError,
}: SurfaceEngineProps) {
  const videoRef = useRef<any>(null);
  const firstFrameReported = useRef(false);

  const handleTimeUpdate = () => {
    if (
      !firstFrameReported.current &&
      (videoRef.current?.currentTime ?? 0) > 0
    ) {
      firstFrameReported.current = true;
      onFirstFrame();
    }
  };

  useEffect(
    () => () => {
      videoRef.current?.pause?.();
      registerMediaTeardown();
    },
    [],
  );

  return (
    <Video
      ref={videoRef}
      width={1920}
      height={1080}
      src={url}
      controls={false}
      autoplay
      muted={false}
      loop={false}
      scalingmode="fill"
      onTimeUpdate={handleTimeUpdate}
      onError={onError}
    />
  );
}

function ShakaDashSurface({
  url,
  onFirstFrame,
  onError,
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
        if (!firstFrameReported.current && player.currentTime > 0) {
          firstFrameReported.current = true;
          onFirstFrame();
        }
      });
      player.addEventListener('error', onError);
      const shaka = new VegaShakaPlayer(player, onError);
      shakaPlayer.current = shaka;
      try {
        await shaka.load(url, 'mpd');
      } catch {
        if (!destroyed.current) {
          onError();
        }
      }
    },
    [onError, onFirstFrame, url],
  );

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

export function MediaSurface({
  streamUrl,
  streamType,
  fallbackStreamUrl,
  fallbackStreamType,
  onFirstFrame,
  onError,
}: MediaSurfaceProps) {
  const [activeSource, setActiveSource] = useState({
    url: streamUrl,
    type: streamType,
  });
  const [mountedSource, setMountedSource] = useState<typeof activeSource>();
  const usingFallback = useRef(false);

  useEffect(() => {
    usingFallback.current = false;
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
    if (fallbackStreamUrl && !usingFallback.current) {
      usingFallback.current = true;
      setActiveSource({
        url: fallbackStreamUrl,
        type: fallbackStreamType,
      });
      return;
    }
    onError();
  }, [fallbackStreamType, fallbackStreamUrl, onError]);

  if (!mountedSource) {
    return <View pointerEvents="none" style={styles.surface} />;
  }

  const Engine =
    mountedSource.type === ('mpd' satisfies MediaStreamType)
      ? ShakaDashSurface
      : NativeHlsSurface;

  return (
    <View pointerEvents="none" style={styles.surface}>
      <Engine
        key={mountedSource.url}
        url={mountedSource.url}
        onFirstFrame={onFirstFrame}
        onError={handleError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: StyleSheet.absoluteFillObject,
});
