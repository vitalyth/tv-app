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
  sourceId?: string;
}

export interface VideoQualityOption {
  id: string;
  label: string;
  height?: number;
  width?: number;
  bitrate?: number;
  active?: boolean;
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
  resumePositionMs?: number;
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

function payloadText(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function logicalLiveKeys(item: MediaItem): string[] {
  const payloadId = payloadText(item.sourcePayload, 'id');
  const payloadChannelId = payloadText(item.sourcePayload, 'channelID');

  return [
    item.id ? `id:${item.id}` : undefined,
    item.channelNumber ? `number:${item.channelNumber}` : undefined,
    item.channelName
      ? `name:${item.channelName.toLowerCase().trim()}`
      : undefined,
    payloadId ? `payload-id:${payloadId}` : undefined,
    payloadChannelId ? `payload-channel-id:${payloadChannelId}` : undefined,
  ].filter((key): key is string => Boolean(key));
}

export function isSameMediaItem(
  current: MediaItem | null | undefined,
  candidate: MediaItem | null | undefined,
): boolean {
  if (!current || !candidate) {
    return false;
  }
  if (current.id === candidate.id) {
    return true;
  }
  if (current.kind !== 'live' || candidate.kind !== 'live') {
    return false;
  }

  const currentKeys = new Set(logicalLiveKeys(current));
  return logicalLiveKeys(candidate).some(key => currentKeys.has(key));
}
