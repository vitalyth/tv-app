import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MediaItem, MediaStream } from './player';
import { useMediaActions } from './MediaController';
import { resolveLiveChannelStream } from '../api/channels';

export const DEFAULT_IMAGE_DEBOUNCE_MS = 300;
export const DEFAULT_VIDEO_DEBOUNCE_MS = 1000;
export const DEFAULT_PREVIEW_DEBOUNCE_MS = DEFAULT_VIDEO_DEBOUNCE_MS;

export interface MediaPreviewEngineOptions {
  imageDebounceMs?: number;
  videoDebounceMs?: number;
  debounceMs?: number;
  streamResolver?: (item: MediaItem) => Promise<MediaStream>;
}

export interface MediaPreviewEngine {
  focusMediaItem: (item: MediaItem) => void;
  clearPreview: () => void;
  getCurrentItem: () => MediaItem | null;
}

export function useMediaPreviewEngine(
  options: MediaPreviewEngineOptions = {},
): MediaPreviewEngine {
  const {
    imageDebounceMs = DEFAULT_IMAGE_DEBOUNCE_MS,
    videoDebounceMs = options.debounceMs ?? DEFAULT_VIDEO_DEBOUNCE_MS,
    streamResolver = resolveLiveChannelStream,
  } = options;

  const { play, showImage, stopAll, markError } = useMediaActions();

  const currentFocusedItemRef = useRef<MediaItem | null>(null);
  const sequenceIdRef = useRef<number>(0);
  const imageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (imageTimerRef.current) {
      clearTimeout(imageTimerRef.current);
      imageTimerRef.current = null;
    }
    if (videoTimerRef.current) {
      clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  }, []);

  const focusMediaItem = useCallback(
    (item: MediaItem) => {
      // If the exact same item is already focused, do nothing
      if (currentFocusedItemRef.current?.id === item.id) {
        return;
      }

      currentFocusedItemRef.current = item;

      // 1. Stop current video and clear previous image immediately
      stopAll();

      // 2. Cancel/obsolete pending previous media timers
      clearTimers();
      const sequence = ++sequenceIdRef.current;

      // 3. Display the new image after imageDebounceMs (300ms)
      imageTimerRef.current = setTimeout(() => {
        if (
          sequenceIdRef.current !== sequence ||
          currentFocusedItemRef.current?.id !== item.id
        ) {
          return;
        }
        showImage(item);
      }, imageDebounceMs);

      // 4. Start video resolution and playback after videoDebounceMs (1000ms)
      videoTimerRef.current = setTimeout(async () => {
        if (
          sequenceIdRef.current !== sequence ||
          currentFocusedItemRef.current?.id !== item.id
        ) {
          return;
        }

        try {
          const stream = await streamResolver(item);

          if (
            sequenceIdRef.current !== sequence ||
            currentFocusedItemRef.current?.id !== item.id
          ) {
            return;
          }

          play(item, stream);
        } catch {
          if (
            sequenceIdRef.current === sequence &&
            currentFocusedItemRef.current?.id === item.id
          ) {
            markError();
          }
        }
      }, videoDebounceMs);
    },
    [
      clearTimers,
      imageDebounceMs,
      markError,
      play,
      showImage,
      stopAll,
      streamResolver,
      videoDebounceMs,
    ],
  );

  const clearPreview = useCallback(() => {
    clearTimers();
    sequenceIdRef.current += 1;
    currentFocusedItemRef.current = null;
    stopAll();
  }, [clearTimers, stopAll]);

  const getCurrentItem = useCallback(() => currentFocusedItemRef.current, []);

  // Cleanup timers on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  return useMemo(
    () => ({
      focusMediaItem,
      clearPreview,
      getCurrentItem,
    }),
    [clearPreview, focusMediaItem, getCurrentItem],
  );
}
