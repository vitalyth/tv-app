import { liveEpgStore, useLiveEpg } from '../state/liveEpg';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type {
  MediaItem,
  MediaPresentation,
  MediaStream,
  PlaybackStatus,
  VideoQualityOption,
  MultiViewState,
} from './player';
import { isSameMediaItem } from './player';
import { multiViewMaxStreams } from './multiViewLayout';
import { softwareMultiViewAvailable } from './nativeMultiView';

export interface MediaControllerValue {
  item?: MediaItem;
  stream?: MediaStream;
  presentation: MediaPresentation;
  isFullscreen: boolean;
  status: PlaybackStatus;
  paused: boolean;
  currentTime: number;
  duration: number;
  seekableStart: number;
  seekableEnd: number;
  videoQualities: VideoQualityOption[];
  selectedQualityId: string;
  multiView: MultiViewState | null;
  enterMultiView: () => void;
  setMultiViewBackend: (
    backend: NonNullable<MultiViewState['backend']>,
  ) => void;
  exitMultiView: () => void;
  setMultiViewChannel: (
    item: MediaItem,
    stream: MediaStream,
    tile?: number,
  ) => void;
  setMultiViewPrimary: (item: MediaItem, stream: MediaStream) => void;
  removeMultiViewChannel: (tile?: number) => void;
  setMultiViewAudio: (tile: number) => void;
  markMultiViewPlaying: (tile?: number) => void;
  markMultiViewError: (tile?: number) => void;
  play: (item: MediaItem, stream: MediaStream) => void;
  playFullscreen: (item: MediaItem, stream: MediaStream) => void;
  openFullscreen: (item: MediaItem) => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  showImage: (item: MediaItem) => void;
  stopVideo: () => void;
  stopAll: () => void;
  markPlaying: () => void;
  markError: () => void;
  setPaused: (paused: boolean) => void;
  togglePlayPause: () => void;
  updateProgress: (
    currentTime: number,
    duration: number,
    seekableStart?: number,
    seekableEnd?: number,
  ) => void;
  setAvailableQualities: (qualities: VideoQualityOption[]) => void;
  setSelectedQuality: (qualityId: string) => void;
  seekTo: (seconds: number) => void;
  registerSeekHandler: (handler: (seconds: number) => void) => () => void;
}

export type MediaControllerActions = Pick<
  MediaControllerValue,
  | 'play'
  | 'playFullscreen'
  | 'openFullscreen'
  | 'enterFullscreen'
  | 'exitFullscreen'
  | 'showImage'
  | 'stopVideo'
  | 'stopAll'
  | 'markPlaying'
  | 'markError'
  | 'setPaused'
  | 'togglePlayPause'
  | 'updateProgress'
  | 'setAvailableQualities'
  | 'setSelectedQuality'
  | 'seekTo'
  | 'registerSeekHandler'
  | 'enterMultiView'
  | 'setMultiViewBackend'
  | 'exitMultiView'
  | 'setMultiViewChannel'
  | 'setMultiViewPrimary'
  | 'removeMultiViewChannel'
  | 'setMultiViewAudio'
  | 'markMultiViewPlaying'
  | 'markMultiViewError'
>;

const MediaControllerContext = createContext<MediaControllerValue | null>(null);
const MediaControllerActionsContext =
  createContext<MediaControllerActions | null>(null);

export function MediaControllerProvider({ children }: PropsWithChildren) {
  const [item, setItem] = useState<MediaItem>();
  const [streamSource, setStreamSource] = useState<{
    item: MediaItem;
    stream: MediaStream;
  }>();
  const stream =
    streamSource && isSameMediaItem(streamSource.item, item)
      ? streamSource.stream
      : undefined;
  const playbackRef = useRef({ item, streamSource });
  playbackRef.current = { item, streamSource };
  const [presentation, setPresentationState] =
    useState<MediaPresentation>('background-image');
  const presentationRef = useRef<MediaPresentation>('background-image');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);
  const setPresentation = useCallback((nextPresentation: MediaPresentation) => {
    presentationRef.current = nextPresentation;
    setPresentationState(nextPresentation);
  }, []);
  const [multiView, setMultiView] = useState<MultiViewState | null>(null);
  const multiViewRef = useRef(multiView);
  multiViewRef.current = multiView;

  const epg = useLiveEpg();
  useEffect(() => {
    setItem(previous => (previous ? liveEpgStore.resolve(previous) : previous));
    setMultiView(previous => {
      if (!previous) return previous;
      const tiles = previous.tiles.map(tile => {
        const updated = liveEpgStore.resolve(tile.item);
        return updated === tile.item ? tile : { ...tile, item: updated };
      });
      return tiles.every((tile, index) => tile === previous.tiles[index])
        ? previous
        : { ...previous, tiles };
    });
  }, [epg]);

  const enterMultiView = useCallback(() => {
    if (presentationRef.current === 'multi-tile') {
      return;
    }
    const current = playbackRef.current;
    if (current.item?.kind !== 'live' || !current.streamSource?.stream) {
      return;
    }
    isFullscreenRef.current = true;
    setIsFullscreen(true);
    setMultiView({ tiles: [], audioTile: 0 });
    setPresentation('multi-tile');
  }, [setPresentation]);

  const exitMultiView = useCallback(() => {
    if (presentationRef.current !== 'multi-tile') {
      return;
    }
    setMultiView(null);
    setPresentation('fullscreen');
  }, [setPresentation]);

  const setMultiViewBackend = useCallback(
    (backend: NonNullable<MultiViewState['backend']>) => {
      if (backend === 'software' && !softwareMultiViewAvailable) {
        return;
      }
      const current = multiViewRef.current;
      if (
        !current ||
        (current.backend ?? 'platform') === backend ||
        current.tiles.length + 1 > multiViewMaxStreams(backend)
      ) {
        return;
      }
      setStatus('loading');
      setMultiView(previous => {
        if (
          !previous ||
          previous.backend === backend ||
          previous.tiles.length + 1 > multiViewMaxStreams(backend)
        ) {
          return previous;
        }
        return {
          ...previous,
          backend,
          audioTile: -1,
          tiles: previous.tiles.map(entry => ({ ...entry, status: 'loading' })),
        };
      });
    },
    [],
  );

  const setMultiViewChannel = useCallback(
    (nextItem: MediaItem, nextStream: MediaStream, tile = 1) => {
      if (
        nextItem.kind !== 'live' ||
        isSameMediaItem(nextItem, playbackRef.current.item)
      ) {
        return;
      }
      setMultiView(previous => {
        if (
          !previous ||
          tile < 1 ||
          tile >= multiViewMaxStreams(previous.backend) ||
          tile > previous.tiles.length + 1 ||
          previous.tiles.some(
            (entry, index) =>
              index !== tile - 1 && isSameMediaItem(entry.item, nextItem),
          )
        ) {
          return previous;
        }
        const tiles = [...previous.tiles];
        tiles[tile - 1] = {
          item: nextItem,
          stream: nextStream,
          status: 'loading',
        };
        return {
          ...previous,
          audioTile: previous.audioTile === tile ? -1 : previous.audioTile,
          tiles,
        };
      });
    },
    [],
  );
  const setMultiViewAudio = useCallback((tile: number) => {
    setMultiView(previous =>
      previous
        ? {
            ...previous,
            audioTile:
              tile === 0 || previous.tiles[tile - 1]?.status === 'playing'
                ? tile
                : -1,
          }
        : null,
    );
  }, []);
  const markMultiViewPlaying = useCallback((tile = 1) => {
    setMultiView(previous =>
      previous?.tiles[tile - 1]
        ? {
            ...previous,
            tiles: previous.tiles.map((entry, index) =>
              index === tile - 1 ? { ...entry, status: 'playing' } : entry,
            ),
          }
        : previous,
    );
  }, []);
  const markMultiViewError = useCallback((tile = 1) => {
    setMultiView(previous =>
      previous?.tiles[tile - 1]
        ? {
            ...previous,
            audioTile: previous.audioTile === tile ? -1 : previous.audioTile,
            tiles: previous.tiles.map((entry, index) =>
              index === tile - 1 ? { ...entry, status: 'error' } : entry,
            ),
          }
        : previous,
    );
  }, []);

  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [paused, setPausedState] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [seekableStart, setSeekableStart] = useState<number>(0);
  const [seekableEnd, setSeekableEnd] = useState<number>(0);
  const [videoQualities, setVideoQualities] = useState<VideoQualityOption[]>(
    [],
  );
  const [selectedQualityId, setSelectedQualityId] = useState<string>('auto');
  const seekHandlerRef = useRef<((seconds: number) => void) | null>(null);

  const removeMultiViewChannel = useCallback(
    (tile = 1) => {
      const current = multiViewRef.current;
      if (
        !current ||
        tile < 0 ||
        tile > current.tiles.length ||
        !current.tiles.length
      ) {
        return;
      }
      if (tile === 0) {
        const next = current.tiles[0];
        setItem(next.item);
        setStreamSource({ item: next.item, stream: next.stream });
        setStatus('loading');
        setCurrentTime(0);
        setDuration(0);
        setSeekableStart(0);
        setSeekableEnd(0);
        setVideoQualities([]);
      }
      const tiles = current.tiles.filter(
        (_entry, index) => index !== Math.max(0, tile - 1),
      );
      if (!tiles.length) {
        setMultiView(null);
        setPresentation('fullscreen');
      } else {
        setMultiView({ ...current, tiles, audioTile: -1 });
      }
    },
    [setPresentation],
  );

  const setMultiViewPrimary = useCallback(
    (nextItem: MediaItem, nextStream: MediaStream) => {
      if (
        presentationRef.current !== 'multi-tile' ||
        nextItem.kind !== 'live'
      ) {
        return;
      }
      setStatus('loading');
      setItem(nextItem);
      setStreamSource({ item: nextItem, stream: nextStream });
      setCurrentTime(0);
      setDuration(0);
      setSeekableStart(0);
      setSeekableEnd(0);
      setVideoQualities([]);
    },
    [],
  );

  const multiViewActions = useMemo(
    () => ({
      setMultiViewBackend,
      enterMultiView,
      exitMultiView,
      setMultiViewChannel,
      setMultiViewPrimary,
      removeMultiViewChannel,
      setMultiViewAudio,
      markMultiViewPlaying,
      markMultiViewError,
    }),
    [
      setMultiViewBackend,
      enterMultiView,
      exitMultiView,
      setMultiViewChannel,
      setMultiViewPrimary,
      removeMultiViewChannel,
      setMultiViewAudio,
      markMultiViewPlaying,
      markMultiViewError,
    ],
  );

  const registerSeekHandler = useCallback(
    (handler: (seconds: number) => void) => {
      seekHandlerRef.current = handler;
      return () => {
        if (seekHandlerRef.current === handler) {
          seekHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const seekTo = useCallback((seconds: number) => {
    if (Number.isFinite(seconds) && seconds >= 0) {
      seekHandlerRef.current?.(seconds);
    }
  }, []);

  const play = useCallback(
    (nextItem: MediaItem, nextStream: MediaStream) => {
      if (isFullscreenRef.current || presentationRef.current === 'fullscreen') {
        return;
      }
      setStatus('loading');
      setIsFullscreen(false);
      setPresentation('single-video');
      setItem(nextItem);
      setStreamSource({ item: nextItem, stream: nextStream });
      setPausedState(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekableStart(0);
      setSeekableEnd(0);
    },
    [setPresentation],
  );

  const playFullscreen = useCallback(
    (nextItem: MediaItem, nextStream: MediaStream) => {
      setMultiView(null);
      isFullscreenRef.current = true;
      setStatus('loading');
      setIsFullscreen(true);
      setPresentation('fullscreen');
      setItem(nextItem);
      setStreamSource({ item: nextItem, stream: nextStream });
      setPausedState(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekableStart(0);
      setSeekableEnd(0);
    },
    [setPresentation],
  );

  const openFullscreen = useCallback(
    (nextItem: MediaItem) => {
      setMultiView(null);
      isFullscreenRef.current = true;
      const current = playbackRef.current;
      if (
        isSameMediaItem(current.item, nextItem) &&
        current.streamSource?.stream
      ) {
        if (presentationRef.current === 'multi-tile') {
          setPresentation('fullscreen');
        }
        setIsFullscreen(true);
        setItem(nextItem);
        return;
      }

      setStatus('loading');
      setIsFullscreen(true);
      setPresentation('fullscreen');
      setItem(nextItem);
      setStreamSource(undefined);
      setPausedState(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekableStart(0);
      setSeekableEnd(0);
      setVideoQualities([]);
    },
    [setPresentation],
  );

  const enterFullscreen = useCallback(() => {
    isFullscreenRef.current = true;
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    setMultiView(null);
    isFullscreenRef.current = false;
    setIsFullscreen(false);
    setPresentation('single-video');
  }, [setPresentation]);

  const showImage = useCallback(
    (nextItem: MediaItem) => {
      if (isFullscreenRef.current || presentationRef.current === 'fullscreen') {
        return;
      }
      setStatus('idle');
      setPresentation('background-image');
      setItem(nextItem);
      setStreamSource(undefined);
      setPausedState(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekableStart(0);
      setSeekableEnd(0);
      setVideoQualities([]);
    },
    [setPresentation],
  );

  const stopVideo = useCallback(() => {
    if (isFullscreenRef.current || presentationRef.current === 'fullscreen') {
      return;
    }
    setStatus('idle');
    setPresentation('background-image');
    setStreamSource(undefined);
    setPausedState(false);
    setCurrentTime(0);
    setDuration(0);
    setSeekableStart(0);
    setSeekableEnd(0);
    setVideoQualities([]);
  }, [setPresentation]);

  const stopAll = useCallback(() => {
    if (isFullscreenRef.current || presentationRef.current === 'fullscreen') {
      return;
    }
    setStatus('idle');
    setPresentation('background-image');
    setItem(undefined);
    setStreamSource(undefined);
    setPausedState(false);
    setCurrentTime(0);
    setDuration(0);
    setSeekableStart(0);
    setSeekableEnd(0);
    setVideoQualities([]);
  }, [setPresentation]);

  const markPlaying = useCallback(() => setStatus('playing'), []);
  const markError = useCallback(() => setStatus('error'), []);

  const setPaused = useCallback((nextPaused: boolean) => {
    setPausedState(nextPaused);
  }, []);

  const togglePlayPause = useCallback(() => {
    setPausedState(prev => !prev);
  }, []);

  const updateProgress = useCallback(
    (
      nextCurrentTime: number,
      nextDuration: number,
      nextSeekableStart?: number,
      nextSeekableEnd?: number,
    ) => {
      setCurrentTime(nextCurrentTime);
      if (nextDuration > 0) {
        setDuration(nextDuration);
      }
      if (
        typeof nextSeekableStart === 'number' &&
        Number.isFinite(nextSeekableStart)
      ) {
        setSeekableStart(nextSeekableStart);
      }
      if (
        typeof nextSeekableEnd === 'number' &&
        Number.isFinite(nextSeekableEnd)
      ) {
        setSeekableEnd(nextSeekableEnd);
      }
    },
    [],
  );

  const setAvailableQualities = useCallback(
    (qualities: VideoQualityOption[]) => {
      setVideoQualities(qualities);
    },
    [],
  );

  const setSelectedQuality = useCallback((qualityId: string) => {
    setSelectedQualityId(qualityId);
  }, []);

  const value = useMemo<MediaControllerValue>(
    () => ({
      ...multiViewActions,
      multiView,
      item,
      stream,
      presentation,
      isFullscreen,
      status,
      paused,
      currentTime,
      duration,
      seekableStart,
      seekableEnd,
      videoQualities,
      selectedQualityId,
      play,
      playFullscreen,
      openFullscreen,
      enterFullscreen,
      exitFullscreen,
      showImage,
      stopVideo,
      stopAll,
      markPlaying,
      markError,
      setPaused,
      togglePlayPause,
      updateProgress,
      setAvailableQualities,
      setSelectedQuality,
      seekTo,
      registerSeekHandler,
    }),
    [
      multiViewActions,
      multiView,
      currentTime,
      duration,
      enterFullscreen,
      exitFullscreen,
      item,
      isFullscreen,
      markError,
      markPlaying,
      openFullscreen,
      paused,
      play,
      playFullscreen,
      presentation,
      selectedQualityId,
      seekableEnd,
      seekableStart,
      seekTo,
      registerSeekHandler,
      setAvailableQualities,
      setPaused,
      setSelectedQuality,
      showImage,
      status,
      stopAll,
      stopVideo,
      stream,
      togglePlayPause,
      updateProgress,
      videoQualities,
    ],
  );

  const actions = useMemo<MediaControllerActions>(
    () => ({
      ...multiViewActions,
      play,
      playFullscreen,
      openFullscreen,
      enterFullscreen,
      exitFullscreen,
      showImage,
      stopVideo,
      stopAll,
      markPlaying,
      markError,
      setPaused,
      togglePlayPause,
      updateProgress,
      setAvailableQualities,
      setSelectedQuality,
      seekTo,
      registerSeekHandler,
    }),
    [
      multiViewActions,
      enterFullscreen,
      exitFullscreen,
      markError,
      markPlaying,
      openFullscreen,
      play,
      playFullscreen,
      registerSeekHandler,
      seekTo,
      setAvailableQualities,
      setPaused,
      setSelectedQuality,
      showImage,
      stopAll,
      stopVideo,
      togglePlayPause,
      updateProgress,
    ],
  );

  return (
    <MediaControllerActionsContext.Provider value={actions}>
      <MediaControllerContext.Provider value={value}>
        {children}
      </MediaControllerContext.Provider>
    </MediaControllerActionsContext.Provider>
  );
}

export function useMediaController() {
  const controller = useContext(MediaControllerContext);
  if (!controller) {
    throw new Error(
      'useMediaController must be used inside MediaControllerProvider',
    );
  }
  return controller;
}

export function useMediaActions() {
  const actions = useContext(MediaControllerActionsContext);
  if (!actions) {
    throw new Error(
      'useMediaActions must be used inside MediaControllerProvider',
    );
  }
  return actions;
}
