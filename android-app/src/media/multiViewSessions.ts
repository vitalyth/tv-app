import {useSyncExternalStore} from 'react';
import type {MediaItem, MediaStream, VideoQualityOption} from './player';

type Commands = {seekTo: (seconds: number) => void; togglePaused: () => void; setQuality: (id: string) => void};
export type MultiViewPlayback = Commands & {
  currentTime: number; duration: number; seekableStart: number; seekableEnd: number;
  paused: boolean; selectedQualityId: string; videoQualities: VideoQualityOption[];
};
const empty: MultiViewPlayback = {
  currentTime: 0, duration: 0, seekableStart: 0, seekableEnd: 0,
  paused: false, selectedQualityId: 'auto', videoQualities: [],
  seekTo: () => {}, togglePaused: () => {}, setQuality: () => {},
};
const sessions = new Map<string, ReturnType<typeof createMultiViewSession>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
};
export const multiViewSessionKey = (item: MediaItem, stream: MediaStream) =>
  `${item.id}:${stream.sourceId ?? ''}:${stream.url}`;

/** Only the visible active panel subscribes; progress never rerenders other decoders. */
export function createMultiViewSession(commands: Commands) {
  let snapshot: MultiViewPlayback = {...empty, ...commands};
  return {
    getSnapshot: () => snapshot,
    update(patch: Partial<MultiViewPlayback>) {
      if (Object.entries(patch).every(([key, value]) => snapshot[key as keyof MultiViewPlayback] === value)) return;
      snapshot = {...snapshot, ...patch};
      notify();
    },
  };
}
export function registerMultiViewSession(key: string, session: ReturnType<typeof createMultiViewSession>) {
  sessions.set(key, session);
  notify();
  return () => {
    if (sessions.get(key) === session) sessions.delete(key);
    notify();
  };
}
export function useMultiViewPlayback(key: string) {
  return useSyncExternalStore(subscribe, () => sessions.get(key)?.getSnapshot() ?? empty);
}
