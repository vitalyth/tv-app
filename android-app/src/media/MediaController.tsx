import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type {
  MediaItem,
  MediaPresentation,
  MediaStream,
  PlaybackStatus,
} from './player';

interface MediaControllerValue {
  item?: MediaItem;
  stream?: MediaStream;
  presentation: MediaPresentation;
  status: PlaybackStatus;
  play: (item: MediaItem, stream: MediaStream) => void;
  showImage: (item: MediaItem) => void;
  markPlaying: () => void;
  markError: () => void;
}

const MediaControllerContext = createContext<MediaControllerValue | null>(null);

export function MediaControllerProvider({ children }: PropsWithChildren) {
  const [item, setItem] = useState<MediaItem>();
  const [stream, setStream] = useState<MediaStream>();
  const [presentation, setPresentation] =
    useState<MediaPresentation>('background-image');
  const [status, setStatus] = useState<PlaybackStatus>('idle');

  const play = useCallback((nextItem: MediaItem, nextStream: MediaStream) => {
    setStatus('loading');
    setPresentation('single-video');
    setItem(nextItem);
    setStream(nextStream);
  }, []);
  const showImage = useCallback((nextItem: MediaItem) => {
    setStatus('idle');
    setPresentation('background-image');
    setItem(nextItem);
    setStream(undefined);
  }, []);
  const markPlaying = useCallback(() => setStatus('playing'), []);
  const markError = useCallback(() => setStatus('error'), []);

  const value = useMemo<MediaControllerValue>(
    () => ({
      item,
      stream,
      presentation,
      status,
      play,
      showImage,
      markPlaying,
      markError,
    }),
    [
      item,
      markError,
      markPlaying,
      play,
      presentation,
      showImage,
      status,
      stream,
    ],
  );

  return (
    <MediaControllerContext.Provider value={value}>
      {children}
    </MediaControllerContext.Provider>
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
