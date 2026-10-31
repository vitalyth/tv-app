import { useSyncExternalStore } from 'react';
import type { MediaItem } from '../media/player';

const metadataKeys = [
  'title',
  'description',
  'imageUrl',
  'backdropUrl',
  'fallbackImageUrl',
  'timeRange',
  'progressPercentage',
  'channelName',
  'channelNumber',
] as const;

export function createLiveEpgStore() {
  let snapshot = { channels: [] as MediaItem[], revision: 0 };
  const listeners = new Set<() => void>();
  const getSnapshot = () => snapshot;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const publish = (channels: MediaItem[]) => {
    snapshot = { channels, revision: snapshot.revision + 1 };
    listeners.forEach(listener => listener());
  };
  const resolve = (item: MediaItem): MediaItem => {
    if (item.kind !== 'live' || item.isLive === false) return item;
    const fresh = snapshot.channels.find(channel => channel.id === item.id);
    if (!fresh || fresh === item) return item;
    const payload = item.sourcePayload as Record<string, unknown> | undefined;
    const freshPayload = fresh.sourcePayload as
      | Record<string, unknown>
      | undefined;
    const metadata = Object.fromEntries(
      metadataKeys.map(key => [key, fresh[key]]),
    );
    const payloadChanged = Boolean(
      payload &&
        freshPayload &&
        (payload.programs !== freshPayload.programs ||
          payload.sources !== freshPayload.sources),
    );
    if (!payloadChanged && metadataKeys.every(key => item[key] === fresh[key]))
      return item;
    return {
      ...item,
      ...metadata,
      // Keep the selected source and playback identity while updating its schedule.
      sourcePayload:
        payload && freshPayload
          ? {
              ...payload,
              programs: freshPayload.programs,
              sources: freshPayload.sources ?? payload.sources,
            }
          : item.sourcePayload,
    };
  };
  return { getSnapshot, subscribe, publish, resolve, active: false };
}

export const liveEpgStore = createLiveEpgStore();

export function useLiveEpg() {
  return useSyncExternalStore(
    liveEpgStore.subscribe,
    liveEpgStore.getSnapshot,
    liveEpgStore.getSnapshot,
  );
}
