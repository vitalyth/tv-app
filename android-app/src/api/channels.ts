import {
  API_BASE_URL,
  API_TIMEOUT_MS,
  SERVICE_BASE_URL,
  SERVICE_REFERER,
} from '../config/api';
import { getJson } from './client';
import type { MediaItem, MediaStream, MediaStreamType } from '../media/player';

interface ApiProgram {
  start?: unknown;
  end?: unknown;
  name?: unknown;
  description?: unknown;
  image?: unknown;
  backdrop?: unknown;
  backdrop_image?: unknown;
  poster?: unknown;
}

interface ApiChannel {
  id?: unknown;
  channelID?: unknown;
  name?: unknown;
  channelNumber?: unknown;
  logo?: unknown;
  artwork?: unknown;
  poster?: unknown;
  backdrop?: unknown;
  linkDetails?: { link?: unknown; vpn?: unknown; referer?: unknown };
  programs?: unknown;
  type?: unknown;
  module?: unknown;
}

const VPN_RESOLVER_MODULES = new Set(['kan', 'reshet']);
const VPN_STREAM_HOST_SUFFIXES = ['cdn-redge.media', 'g-mana.live'];

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function timestamp(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function currentProgram(programs: unknown): ApiProgram | undefined {
  if (!Array.isArray(programs)) {
    return undefined;
  }
  const now = Date.now();
  return programs.find(program => {
    if (!program || typeof program !== 'object') {
      return false;
    }
    const candidate = program as ApiProgram;
    const start = timestamp(candidate.start);
    const end = timestamp(candidate.end);
    return (
      start !== undefined && end !== undefined && start <= now && now < end
    );
  }) as ApiProgram | undefined;
}

export function resolveBackdropUrl(
  program?: ApiProgram,
  channel?: ApiChannel,
): string | undefined {
  // 1. Highest-quality Program/VOD backdrop
  const programBackdrop =
    text(program?.backdrop) ?? text(program?.backdrop_image);
  if (programBackdrop) {
    return proxiedImageUrl(programBackdrop);
  }
  // 2. Highest-quality Program/VOD image
  const programImage = text(program?.image) ?? text(program?.poster);
  if (programImage) {
    return proxiedImageUrl(programImage);
  }
  // 3. Highest-quality Channel artwork
  const channelArtwork =
    text(channel?.artwork) ?? text(channel?.backdrop) ?? text(channel?.poster);
  if (channelArtwork) {
    return channelArtwork.startsWith('http')
      ? proxiedImageUrl(channelArtwork)
      : `${SERVICE_BASE_URL}/ch/${channelArtwork.replace(/^\//, '')}`;
  }
  // 4. Channel fallback
  return channelLogoUrl(channel?.logo);
}

export function resolvePosterUrl(
  program?: ApiProgram,
  channel?: ApiChannel,
): string | undefined {
  // 1. Highest-quality Program/VOD image
  const programImage = text(program?.image) ?? text(program?.poster);
  if (programImage) {
    return proxiedImageUrl(programImage);
  }
  // 2. Highest-quality Channel artwork
  const channelArtwork = text(channel?.artwork) ?? text(channel?.poster);
  if (channelArtwork) {
    return channelArtwork.startsWith('http')
      ? proxiedImageUrl(channelArtwork)
      : `${SERVICE_BASE_URL}/ch/${channelArtwork.replace(/^\//, '')}`;
  }
  // 3. Channel fallback
  return channelLogoUrl(channel?.logo);
}

function channelLogoUrl(logo: unknown) {
  const logoPath = text(logo);
  if (!logoPath) {
    return undefined;
  }
  return logoPath.startsWith('http')
    ? proxiedImageUrl(logoPath)
    : `${SERVICE_BASE_URL}/ch/${logoPath.replace(/^\//, '')}`;
}

function proxiedImageUrl(rawUrl: string) {
  if (!/^https?:\/\//.test(rawUrl) || rawUrl.startsWith(SERVICE_BASE_URL)) {
    return rawUrl.startsWith('/') ? `${SERVICE_BASE_URL}${rawUrl}` : rawUrl;
  }
  let referer = SERVICE_REFERER;
  if (rawUrl.includes('kan.org.il')) {
    referer = 'https://www.kan.org.il/';
  } else if (rawUrl.includes('mako.co.il')) {
    referer = 'https://www.mako.co.il/';
  } else if (rawUrl.includes('13tv.co.il') || rawUrl.includes('reshet')) {
    referer = 'https://13tv.co.il/';
  }
  return `${API_BASE_URL}/proxy?url=${encodeURIComponent(
    rawUrl,
  )}&referer=${encodeURIComponent(referer)}`;
}

function toMediaItem(channel: ApiChannel): MediaItem | undefined {
  const id = text(channel.id);
  const channelName = text(channel.name);
  if (!id || !channelName) {
    return undefined;
  }
  const program = currentProgram(channel.programs);
  const backdropUrl = resolveBackdropUrl(program, channel);
  const posterUrl = resolvePosterUrl(program, channel);
  const fallbackImageUrl = channelLogoUrl(channel.logo);
  return {
    id,
    kind: 'live',
    title: text(program?.name) ?? channelName,
    imageUrl: posterUrl ?? backdropUrl ?? fallbackImageUrl,
    fallbackImageUrl,
    backdropUrl: backdropUrl ?? posterUrl ?? fallbackImageUrl,
    description: text(program?.description),
    channelName,
    channelNumber:
      typeof channel.channelNumber === 'number'
        ? String(channel.channelNumber)
        : text(channel.channelNumber),
    sourcePayload: channel,
  };
}

function requiresVpnResolver(channel: ApiChannel) {
  const module = text(channel.module)?.toLowerCase();
  const streamUrl = text(channel.linkDetails?.link);
  const streamHost =
    streamUrl?.match(/^https?:\/\/([^/:?#]+)/i)?.[1]?.toLowerCase() ?? '';
  return (
    Boolean(channel.linkDetails?.vpn) ||
    (module !== undefined && VPN_RESOLVER_MODULES.has(module)) ||
    VPN_STREAM_HOST_SUFFIXES.some(
      suffix => streamHost === suffix || streamHost.endsWith(`.${suffix}`),
    )
  );
}

function playbackProxyUrl(streamUrl: string, channel: ApiChannel) {
  if (
    streamUrl.includes('/proxy?url=') ||
    streamUrl.includes('/v/proxy?url=')
  ) {
    return streamUrl;
  }
  const useVpn = requiresVpnResolver(channel);
  const endpoint = useVpn ? '/v/proxy' : '/proxy';
  const url = encodeURIComponent(streamUrl);
  const referer = encodeURIComponent(
    text(channel.linkDetails?.referer) ?? SERVICE_REFERER,
  );
  const vpn = useVpn ? '&vpn=true' : '';
  return `${API_BASE_URL}${endpoint}?url=${url}&referer=${referer}${vpn}`;
}

function mediaStreamType(streamUrl: string): MediaStreamType | undefined {
  const normalized = streamUrl.toLowerCase();
  if (normalized.includes('.m3u8')) {
    return 'm3u8';
  }
  if (
    normalized.includes('.mpd') ||
    normalized.includes('/livedash/') ||
    /\.livx(?:\?|$)/.test(normalized)
  ) {
    return 'mpd';
  }
  return undefined;
}

function redgeHlsFallback(streamUrl: string): string | undefined {
  const normalized = streamUrl.toLowerCase();
  if (
    !normalized.includes('cdn-redge.media/livedash/') ||
    !/\.livx(?:\?|$)/.test(normalized)
  ) {
    return undefined;
  }
  return streamUrl
    .replace('/livedash/', '/livehls/')
    .replace(/\.livx(?=\?|$)/, '.livx/playlist.m3u8');
}

export async function getLiveChannelCount(): Promise<number> {
  const channels = await getJson<unknown>('/live_channels');
  if (!Array.isArray(channels)) {
    throw new Error('Unexpected live channels response');
  }
  return channels.length;
}

export async function getPlayableLiveChannels(): Promise<MediaItem[]> {
  const channels = await getJson<unknown>('/live_channels');
  if (!Array.isArray(channels)) {
    throw new Error('Unexpected live channels response');
  }
  return channels
    .map(channel =>
      channel &&
      typeof channel === 'object' &&
      text((channel as ApiChannel).type)?.toLowerCase() === 'tv'
        ? toMediaItem(channel as ApiChannel)
        : undefined,
    )
    .filter((item): item is MediaItem => item !== undefined);
}

export async function resolveLiveChannelStream(
  item: MediaItem,
): Promise<MediaStream> {
  const channel = item.sourcePayload as ApiChannel | undefined;
  if (!channel) {
    throw new Error('Live channel payload is missing');
  }
  const useVpn = requiresVpnResolver(channel);
  const endpoint = useVpn ? '/v/live_channel' : '/live_channel';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(channel),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Live stream resolver failed (${response.status})`);
    }
    const result = (await response.json()) as { stream?: unknown };
    const stream = text(result.stream);
    if (!stream) {
      throw new Error('Live stream resolver returned no stream');
    }
    const fallbackStream = redgeHlsFallback(stream);
    return {
      url: playbackProxyUrl(stream, channel),
      type: mediaStreamType(stream),
      fallbackUrl: fallbackStream
        ? playbackProxyUrl(fallbackStream, channel)
        : undefined,
      fallbackType: fallbackStream ? 'm3u8' : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
