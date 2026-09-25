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
  index?: unknown;
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
  sources?: unknown[];
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

function splitUrlSuffix(rawUrl: string): [string, string] {
  const suffixIndex = rawUrl.search(/[?#]/);
  return suffixIndex === -1
    ? [rawUrl, '']
    : [rawUrl.slice(0, suffixIndex), rawUrl.slice(suffixIndex)];
}

function replaceNumericQueryParams(
  rawUrl: string,
  keys: readonly string[],
  value: number,
): string {
  return keys.reduce(
    (url, key) =>
      url.replace(
        new RegExp(`([?&])(${key})=\\d+`, 'gi'),
        (_match, separator: string, originalKey: string) =>
          `${separator}${originalKey}=${value}`,
      ),
    rawUrl,
  );
}

export function upgradeImageResolution(
  rawUrl: string,
  isBackdrop = false,
): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl;
  }

  const targetWidth = isBackdrop ? 1920 : 480;
  const targetHeight = isBackdrop ? 1080 : 270;
  const targetQuality = isBackdrop ? 90 : 78;

  try {
    // 1. Immergo / Channel 14 resize proxy: extract inner original URL for high-res backdrop
    if (isBackdrop && rawUrl.includes('insight-images-do.immergo.tv/resize')) {
      const match = rawUrl.match(/[?&]url=([^&]+)/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    // 2. Kaltura OTT CDN: /width/X/height/Y/quality/Z
    if (rawUrl.includes('images.frp1.ott.kaltura.com')) {
      const [pathWithOrigin, suffix] = splitUrlSuffix(rawUrl);
      let path = pathWithOrigin
        .replace(/\/width\/\d+/gi, `/width/${targetWidth}`)
        .replace(/\/height\/\d+/gi, `/height/${targetHeight}`)
        .replace(/\/quality\/\d+/gi, `/quality/${targetQuality}`);
      if (!/\/width\/\d+/i.test(path)) {
        path = `${path.replace(/\/+$/, '')}/width/${targetWidth}/height/${targetHeight}`;
      }
      if (!/\/quality\/\d+/i.test(path)) {
        path = `${path.replace(/\/+$/, '')}/quality/${targetQuality}`;
      }
      return `${path}${suffix}`;
    }

    // 3. Cloudinary (Reshet 13 & others): /image/upload/...
    if (rawUrl.includes('/image/upload/')) {
      const marker = '/image/upload/';
      const idx = rawUrl.indexOf(marker);
      if (idx !== -1) {
        const prefix = rawUrl.substring(0, idx + marker.length);
        const suffix = rawUrl.substring(idx + marker.length);
        const parts = suffix.split('/');
        const versionIdx = parts.findIndex(p => /^v\d+$/.test(p));
        const hasNamedTransformation = /^t_[^/]+$/.test(parts[0] ?? '');
        const rest =
          versionIdx >= 0
            ? parts.slice(versionIdx).join('/')
            : parts.slice(hasNamedTransformation ? 1 : 0).join('/');
        if (rest) {
          return `${prefix}c_fill,g_auto,w_${targetWidth},h_${targetHeight},q_${targetQuality},f_auto/${rest}`;
        }
      }
    }

    // 4. Kan only serves the EPG thumbnail's original size and 1920x1080.
    if (rawUrl.includes('kan.org.il/')) {
      if (!isBackdrop) {
        return rawUrl;
      }
      const withWidth = replaceNumericQueryParams(rawUrl, ['width'], 1920);
      return replaceNumericQueryParams(withWidth, ['height'], 1080);
    }

    // 5. Query resize params used by Redge and generic image services.
    if (/[?&](?:width|w|dstw|height|h|dsth)=\d+/i.test(rawUrl)) {
      const withWidth = replaceNumericQueryParams(
        rawUrl,
        ['width', 'w', 'dstw'],
        targetWidth,
      );
      const withHeight = replaceNumericQueryParams(
        withWidth,
        ['height', 'h', 'dsth'],
        targetHeight,
      );
      return replaceNumericQueryParams(
        withHeight,
        ['quality', 'q'],
        targetQuality,
      );
    }

    // 6. Channel 14 WordPress image service: /images/{width}/{quality}/...
    if (/\/images\/\d+\/\d+\//i.test(rawUrl)) {
      return rawUrl.replace(
        /\/images\/\d+\/\d+\//i,
        `/images/${targetWidth}/${targetQuality}/`,
      );
    }

    // 7. Path segment resize params like /w_300,h_200/
    if (/[,/]w_\d+/.test(rawUrl)) {
      return rawUrl
        .replace(/w_\d+/gi, `w_${targetWidth}`)
        .replace(/h_\d+/gi, `h_${targetHeight}`)
        .replace(/q_\d+/gi, `q_${targetQuality}`);
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

export function resolveBackdropUrl(
  program?: ApiProgram,
  channel?: ApiChannel,
): string | undefined {
  // 1. Highest-quality Program/VOD backdrop
  const programBackdrop =
    text(program?.backdrop) ?? text(program?.backdrop_image);
  if (programBackdrop) {
    return proxiedImageUrl(upgradeImageResolution(programBackdrop, true));
  }
  // 2. Highest-quality Program/VOD image
  const programImage = text(program?.image) ?? text(program?.poster);
  if (programImage) {
    return proxiedImageUrl(upgradeImageResolution(programImage, true));
  }
  // 3. Highest-quality Channel artwork
  const channelArtwork =
    text(channel?.artwork) ?? text(channel?.backdrop) ?? text(channel?.poster);
  if (channelArtwork) {
    const upgraded = upgradeImageResolution(channelArtwork, true);
    return upgraded.startsWith('http')
      ? proxiedImageUrl(upgraded)
      : `${SERVICE_BASE_URL}/ch/${upgraded.replace(/^\//, '')}`;
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
    return proxiedImageUrl(upgradeImageResolution(programImage, false));
  }
  // 2. Highest-quality Channel artwork
  const channelArtwork = text(channel?.artwork) ?? text(channel?.poster);
  if (channelArtwork) {
    const upgraded = upgradeImageResolution(channelArtwork, false);
    return upgraded.startsWith('http')
      ? proxiedImageUrl(upgraded)
      : `${SERVICE_BASE_URL}/ch/${upgraded.replace(/^\//, '')}`;
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

export function proxiedImageUrl(rawUrl: string) {
  if (!/^https?:\/\//.test(rawUrl) || rawUrl.startsWith(SERVICE_BASE_URL)) {
    return rawUrl.startsWith('/') ? `${SERVICE_BASE_URL}${rawUrl}` : rawUrl;
  }
  return `${API_BASE_URL}/image_proxy?url=${encodeURIComponent(rawUrl)}`;
}

function formatProgramTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatProgramTimeRange(
  startMs?: number,
  endMs?: number,
): string | undefined {
  if (!startMs || !endMs) {
    return undefined;
  }
  return `${formatProgramTime(startMs)} - ${formatProgramTime(endMs)}`;
}

export function calculateProgramProgress(
  startMs?: number,
  endMs?: number,
): number | undefined {
  if (!startMs || !endMs || endMs <= startMs) {
    return undefined;
  }
  const now = Date.now();
  if (now < startMs) return 0;
  if (now >= endMs) return 100;
  return Math.round(((now - startMs) / (endMs - startMs)) * 100);
}

export interface LiveChannelOptions {
  requireEpg?: boolean;
}

export function toMediaItem(
  channel: ApiChannel,
  options?: LiveChannelOptions,
): MediaItem | undefined {
  const id = text(channel.id) ?? text(channel.channelID);
  const channelName = text(channel.name);
  if (!id || !channelName) {
    return undefined;
  }
  const program = currentProgram(channel.programs);
  const programTitle = text(program?.name);
  const startMs = program ? timestamp(program.start) : undefined;
  const endMs = program ? timestamp(program.end) : undefined;
  const timeRange = formatProgramTimeRange(startMs, endMs);

  if (options?.requireEpg && (!program || !programTitle || !timeRange)) {
    return undefined;
  }

  const progressPercentage = calculateProgramProgress(startMs, endMs);
  const backdropUrl = resolveBackdropUrl(program, channel);
  const posterUrl = resolvePosterUrl(program, channel);
  const fallbackImageUrl = channelLogoUrl(channel.logo);
  return {
    id,
    kind: 'live',
    title: programTitle ?? channelName,
    imageUrl: posterUrl ?? backdropUrl ?? fallbackImageUrl,
    fallbackImageUrl,
    backdropUrl: backdropUrl ?? posterUrl ?? fallbackImageUrl,
    description: text(program?.description),
    channelName,
    channelNumber:
      typeof channel.channelNumber === 'number'
        ? String(channel.channelNumber)
        : text(channel.channelNumber),
    timeRange,
    progressPercentage,
    isLive: true,
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

function mediaStreamType(streamUrl: string): MediaStreamType {
  const normalized = streamUrl.toLowerCase();
  if (
    normalized.includes('.m3u8') ||
    normalized.includes('mpegurl') ||
    normalized.includes('/livehls/') ||
    normalized.includes('/hls/')
  ) {
    return 'm3u8';
  }
  if (
    normalized.includes('.mpd') ||
    normalized.includes('application/dash+xml') ||
    (normalized.includes('/livedash/') && !normalized.includes('.m3u8')) ||
    (normalized.includes('.livx') && !normalized.includes('.m3u8'))
  ) {
    return 'mpd';
  }
  return 'm3u8';
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

export function distinctLogicalChannels(rawChannels: unknown[]): ApiChannel[] {
  const tvChannels = rawChannels.filter(
    ch =>
      ch &&
      typeof ch === 'object' &&
      text((ch as ApiChannel).type)?.toLowerCase() === 'tv',
  ) as ApiChannel[];

  const distinctList: ApiChannel[] = [];
  const seenKeys = new Map<string, ApiChannel>();

  const cloneWithoutSources = (ch: ApiChannel): ApiChannel => {
    const copy = { ...ch };
    delete copy.sources;
    return copy;
  };

  for (const channel of tvChannels) {
    const rawIndex = Number(channel.index);
    const indexKey =
      Number.isFinite(rawIndex) && rawIndex > 0 ? `idx:${rawIndex}` : undefined;
    const numKey = channel.channelNumber
      ? `num:${String(channel.channelNumber).trim()}`
      : undefined;
    const nameKey = text(channel.name)
      ? `name:${text(channel.name)?.toLowerCase().trim()}`
      : undefined;
    const idKey = text(channel.channelID) ?? text(channel.id) ?? '';

    // Primary unique key: prefer indexKey, then numKey, then nameKey, then idKey
    const logicalKey = indexKey ?? numKey ?? nameKey ?? idKey;

    const existing = seenKeys.get(logicalKey);
    if (existing) {
      if (!Array.isArray(existing.sources)) {
        existing.sources = [cloneWithoutSources(existing)];
      }
      existing.sources.push(cloneWithoutSources(channel));
      if (
        (!existing.programs ||
          !Array.isArray(existing.programs) ||
          existing.programs.length === 0) &&
        channel.programs &&
        Array.isArray(channel.programs) &&
        channel.programs.length > 0
      ) {
        existing.programs = channel.programs;
      }
    } else {
      const distinctChannel: ApiChannel = { ...channel };
      distinctChannel.sources = [cloneWithoutSources(channel)];
      seenKeys.set(logicalKey, distinctChannel);
      distinctList.push(distinctChannel);
    }
  }

  return distinctList;
}

export async function getDistinctLiveChannels(
  options: LiveChannelOptions = { requireEpg: true },
): Promise<MediaItem[]> {
  const channels = await getJson<unknown>('/live_channels');
  if (!Array.isArray(channels)) {
    throw new Error('Unexpected live channels response');
  }
  const distinct = distinctLogicalChannels(channels);
  return distinct
    .map(channel => toMediaItem(channel, options))
    .filter((item): item is MediaItem => item !== undefined);
}

export function refreshMediaItemEpg(item: MediaItem): MediaItem {
  const channel = item.sourcePayload as ApiChannel | undefined;
  if (!channel || !Array.isArray(channel.programs)) {
    return item;
  }
  const program = currentProgram(channel.programs);
  if (!program) {
    return item;
  }
  const programTitle = text(program.name);
  if (!programTitle) {
    return item;
  }
  const startMs = timestamp(program.start);
  const endMs = timestamp(program.end);
  const timeRange = formatProgramTimeRange(startMs, endMs);
  const progressPercentage = calculateProgramProgress(startMs, endMs);
  const backdropUrl = resolveBackdropUrl(program, channel);
  const posterUrl = resolvePosterUrl(program, channel);

  return {
    ...item,
    title: programTitle,
    description: text(program.description),
    imageUrl: posterUrl ?? backdropUrl ?? item.fallbackImageUrl ?? item.imageUrl,
    backdropUrl: backdropUrl ?? posterUrl ?? item.fallbackImageUrl ?? item.backdropUrl,
    timeRange: timeRange ?? item.timeRange,
    progressPercentage: progressPercentage ?? item.progressPercentage,
  };
}

export function mergeLiveChannelsPreservingOrder(
  existingItems: MediaItem[],
  freshItems: MediaItem[],
): MediaItem[] {
  const freshMap = new Map<string, MediaItem>();
  for (const item of freshItems) {
    freshMap.set(item.id, item);
  }

  return existingItems.map(existing => {
    const fresh = freshMap.get(existing.id);
    if (!fresh) {
      return refreshMediaItemEpg(existing);
    }
    return {
      ...existing,
      title: fresh.title,
      description: fresh.description,
      imageUrl: fresh.imageUrl,
      backdropUrl: fresh.backdropUrl,
      timeRange: fresh.timeRange,
      progressPercentage: fresh.progressPercentage,
      sourcePayload: fresh.sourcePayload ?? existing.sourcePayload,
    };
  });
}

export async function getPlayableLiveChannels(): Promise<MediaItem[]> {
  return getDistinctLiveChannels({ requireEpg: false });
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
    const channelPayload = { ...channel };
    delete channelPayload.sources;
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(channelPayload),
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
