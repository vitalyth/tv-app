import {
  createContext,
  useCallback,
  useContext,
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
} from './player';
import { isSameMediaItem } from './player';

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
  const stream = streamSource && isSameMediaItem(streamSource.item, item)
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

  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [paused, setPausedState] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [seekableStart, setSeekableStart] = useState<number>(0);
  const [seekableEnd, setSeekableEnd] = useState<number>(0);
  const [videoQualities, setVideoQualities] = useState<VideoQualityOption[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState<string>('auto');
  const seekHandlerRef = useRef<((seconds: number) => void) | null>(null);

  const registerSeekHandler = useCallback((handler: (seconds: number) => void) => {
    seekHandlerRef.current = handler;
    return () => {
      if (seekHandlerRef.current === handler) {
        seekHandlerRef.current = null;
      }
    };
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (Number.isFinite(seconds) && seconds >= 0) {
      seekHandlerRef.current?.(seconds);
    }
  }, []);

  const play = useCallback((nextItem: MediaItem, nextStream: MediaStream) => {
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
  }, [setPresentation]);

  const playFullscreen = useCallback((nextItem: MediaItem, nextStream: MediaStream) => {
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
  }, [setPresentation]);

  const openFullscreen = useCallback((nextItem: MediaItem) => {
    isFullscreenRef.current = true;
    const current = playbackRef.current;
    if (isSameMediaItem(current.item, nextItem) && current.streamSource?.stream) {
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
  }, [setPresentation]);

  const enterFullscreen = useCallback(() => {
    isFullscreenRef.current = true;
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    isFullscreenRef.current = false;
    setIsFullscreen(false);
    setPresentation('single-video');
  }, [setPresentation]);

  const showImage = useCallback((nextItem: MediaItem) => {
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
  }, [setPresentation]);

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

  const updateProgress = useCallback((
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
  }, []);

  const setAvailableQualities = useCallback((qualities: VideoQualityOption[]) => {
    setVideoQualities(qualities);
  }, []);

  const setSelectedQuality = useCallback((qualityId: string) => {
    setSelectedQualityId(qualityId);
  }, []);

  const value = useMemo<MediaControllerValue>(
    () => ({
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
