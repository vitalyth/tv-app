import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MediaItem, MediaStream } from './player';
import { useMediaActions } from './MediaController';
import { resolveLiveChannelStream } from '../api/channels';

export const DEFAULT_PREVIEW_DEBOUNCE_MS = 400;

export interface MediaPreviewEngineOptions {
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
    debounceMs = DEFAULT_PREVIEW_DEBOUNCE_MS,
    streamResolver = resolveLiveChannelStream,
  } = options;

  const { play, showImage, stopVideo, markError } = useMediaActions();

  const currentFocusedItemRef = useRef<MediaItem | null>(null);
  const sequenceIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const focusMediaItem = useCallback(
    (item: MediaItem) => {
      // If the exact same item is already focused, do nothing
      if (currentFocusedItemRef.current?.id === item.id) {
        return;
      }

      currentFocusedItemRef.current = item;

      // 1. Stop current video immediately
      stopVideo();

      // 2. Cancel/obsolete pending previous media work
      clearTimer();
      const sequence = ++sequenceIdRef.current;

      // 3 & 4. Display the new image immediately
      showImage(item);

      // 5. Start a short configurable focus debounce
      debounceTimerRef.current = setTimeout(async () => {
        // 6. Confirm the same media item is still relevant
        if (
          sequenceIdRef.current !== sequence ||
          currentFocusedItemRef.current?.id !== item.id
        ) {
          return;
        }

        try {
          // 7. Resolve the stream
          const stream = await streamResolver(item);

          // Confirm again after async resolution
          if (
            sequenceIdRef.current !== sequence ||
            currentFocusedItemRef.current?.id !== item.id
          ) {
            return;
          }

          // 8. When ready, transition Image -> Video
          play(item, stream);
        } catch {
          // If stream resolution fails, remain on the backdrop/image safely
          if (
            sequenceIdRef.current === sequence &&
            currentFocusedItemRef.current?.id === item.id
          ) {
            markError();
          }
        }
      }, debounceMs);
    },
    [clearTimer, debounceMs, markError, play, showImage, stopVideo, streamResolver],
  );

  const clearPreview = useCallback(() => {
    clearTimer();
    sequenceIdRef.current += 1;
    currentFocusedItemRef.current = null;
    stopVideo();
  }, [clearTimer, stopVideo]);

  const getCurrentItem = useCallback(() => currentFocusedItemRef.current, []);

  // Cleanup timers on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  return useMemo(
    () => ({
      focusMediaItem,
      clearPreview,
      getCurrentItem,
    }),
    [clearPreview, focusMediaItem, getCurrentItem],
  );
}
