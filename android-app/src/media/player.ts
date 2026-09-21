export type MediaKind = 'live' | 'vod';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  streamUrl: string;
}

export interface PlayerAdapter {
  prepare(item: MediaItem): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  release(): Promise<void>;
}

export interface PlayerAdapterFactory {
  create(): PlayerAdapter;
}
