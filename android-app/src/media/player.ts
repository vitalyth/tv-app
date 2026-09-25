export type MediaKind = 'live' | 'vod';

export type MediaPresentation =
  | 'background-image'
  | 'single-video'
  | 'fullscreen'
  | 'multi-tile';

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'error';

export type MediaStreamType = 'm3u8' | 'mpd';

export interface MediaStream {
  url: string;
  type?: MediaStreamType;
  fallbackUrl?: string;
  fallbackType?: MediaStreamType;
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  programName?: string;
  seasonName?: string;
  episodeName?: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  backdropUrl?: string;
  description?: string;
  channelName?: string;
  channelNumber?: string;
  timeRange?: string;
  progressPercentage?: number;
  isLive?: boolean;
  sourcePayload?: unknown;
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
