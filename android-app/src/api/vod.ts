import {
  API_BASE_URL,
  API_TIMEOUT_MS,
  SERVICE_BASE_URL,
} from '../config/api';
import { getJson } from './client';
import { proxiedImageUrl, upgradeImageResolution } from './channels';
import type { MediaItem, MediaStream, MediaStreamType } from '../media/player';
import { t } from '../i18n';

export interface ApiVodRecentItem {
  id?: unknown;
  episodeId?: unknown;
  name?: unknown;
  title?: unknown;
  url?: unknown;
  streamUrl?: unknown;
  playUrl?: unknown;
  streamEndpoint?: unknown;
  logo?: unknown;
  image?: unknown;
  description?: unknown;
  plot?: unknown;
  aired?: unknown;
  season?: unknown;
  episode?: unknown;
  programId?: unknown;
  programName?: unknown;
  programDescription?: unknown;
  programImage?: unknown;
  seasonName?: unknown;
  channelName?: unknown;
  channelImage?: unknown;
  episodeName?: unknown;
  episodeDescription?: unknown;
  episodeImage?: unknown;
  module?: unknown;
  sourceTimestamp?: unknown;
  sourceOrder?: unknown;
  vodChannelId?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveVodImage(item: ApiVodRecentItem): {
  imageUrl?: string;
  backdropUrl?: string;
  fallbackImageUrl?: string;
} {
  // 1. Episode-specific image
  const epImage =
    text(item.episodeImage) ?? text(item.image) ?? text(item.logo);
  // 2. Program-specific image
  const progImage = text(item.programImage);
  // 3. Channel/provider logo
  const chImage = text(item.channelImage);

  const selectedPrimary = epImage || progImage || chImage;
  const selectedFallback = chImage || progImage || epImage;

  const normalizeUrl = (raw?: string, isBackdrop = false): string | undefined => {
    if (!raw) return undefined;
    const upgraded = upgradeImageResolution(raw, isBackdrop);
    if (upgraded.startsWith('http')) {
      return proxiedImageUrl(upgraded);
    }
    return `${SERVICE_BASE_URL}/ch/${upgraded.replace(/^\//, '')}`;
  };

  const imageUrl = normalizeUrl(selectedPrimary, false);
  const backdropUrl = normalizeUrl(selectedPrimary, true);
  const fallbackImageUrl = normalizeUrl(selectedFallback, false);

  return { imageUrl, backdropUrl, fallbackImageUrl };
}

export function toVodMediaItem(item: ApiVodRecentItem): MediaItem | undefined {
  const episodeId = text(item.episodeId) ?? text(item.id);
  if (!episodeId) {
    return undefined;
  }

  const title =
    text(item.episodeName) ??
    text(item.name) ??
    text(item.title) ??
    text(item.programName) ??
    t('vodProgram');

  const channelName =
    text(item.channelName) ??
    text(item.programName) ??
    (text(item.module)?.includes('kan') ? 'כאן 11' : undefined);

  const description =
    text(item.episodeDescription) ??
    text(item.description) ??
    text(item.plot) ??
    text(item.programDescription);

  const { imageUrl, backdropUrl, fallbackImageUrl } = resolveVodImage(item);

  return {
    id: `vod-${episodeId}`,
    kind: 'vod',
    title,
    description,
    channelName,
    channelNumber: text(item.season)
      ? t('seasonNumber', { season: text(item.season)! })
      : undefined,
    imageUrl: imageUrl ?? fallbackImageUrl,
    backdropUrl: backdropUrl ?? imageUrl ?? fallbackImageUrl,
    fallbackImageUrl,
    sourcePayload: item,
  };
}

function detectStreamType(url: string): MediaStreamType {
  const normalized = url.toLowerCase();
  if (normalized.includes('.mpd') || normalized.includes('/livedash/')) {
    return 'mpd';
  }
  return 'm3u8';
}

export async function getRecentVodItems(): Promise<MediaItem[]> {
  const rawList = await getJson<unknown>('/vod_recent');
  if (!Array.isArray(rawList)) {
    throw new Error('Unexpected vod_recent response');
  }

  return rawList
    .map(raw => (raw && typeof raw === 'object' ? toVodMediaItem(raw as ApiVodRecentItem) : undefined))
    .filter((item): item is MediaItem => item !== undefined);
}

/**
 * Resolves the raw VOD stream URL from the backend API, exactly matching
 * Next.js channelService.getVodStream and old Android app api.getVodStream.
 */
export async function getVodStreamFromApi(
  item: ApiVodRecentItem | Record<string, unknown>,
): Promise<string | null> {
  // 1. Direct stream candidate from streamUrl or playUrl if already a video stream
  const candidate =
    text((item as any)?.streamUrl) ??
    text((item as any)?.playUrl) ??
    text((item as any)?.url);
  if (
    candidate &&
    (candidate.includes('.m3u8') ||
      candidate.includes('.mpd') ||
      candidate.includes('.mp4'))
  ) {
    return candidate;
  }

  // 2. If streamEndpoint exists, call it (e.g. /kan-vod/stream?episode_id=1101317)
  const streamEndpointVal = text((item as any)?.streamEndpoint);
  if (streamEndpointVal) {
    const cleanEndpoint = streamEndpointVal.replace(/^\/api(?=\/)/, '');
    const endpointUrl = cleanEndpoint.startsWith('http')
      ? cleanEndpoint
      : `${API_BASE_URL}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      const res = await fetch(endpointUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as { stream?: unknown };
        const resolved = text(data?.stream);
        if (resolved) {
          return resolved;
        }
      }
    } catch {}
  }

  const rawModule = (
    text((item as any)?.module) ??
    text((item as any)?.channelName) ??
    ''
  ).toLowerCase();
  const rawId = String(
    (item as any)?.episodeId || (item as any)?.id || '',
  ).trim();
  const cleanId = rawId.replace(
    /^(kan-vod:|keshet-vod:|reshet-vod:|c14-vod:|i24-vod:|kan_|mako_|keshet_|reshet_|c14_|i24_)/i,
    '',
  );

  // 3. Kan VOD endpoint
  if (rawModule.includes('kan') || (item as any)?.vodChannelId === 'vod_kan11') {
    if (cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(
          `${API_BASE_URL}/kan-vod/stream?episode_id=${encodeURIComponent(cleanId)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { stream?: unknown };
          const resolved = text(data?.stream);
          if (resolved) return resolved;
        }
      } catch {}
    }
  }

  // 4. Keshet / Mako VOD endpoint
  if (rawModule.includes('keshet') || rawModule.includes('mako')) {
    if (cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(
          `${API_BASE_URL}/keshet-vod/stream?episode_id=${encodeURIComponent(cleanId)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { stream?: unknown };
          const resolved = text(data?.stream);
          if (resolved) return resolved;
        }
      } catch {}
    }
  }

  // 5. Reshet VOD endpoint (matching Next.js: if (item?.module === "reshet-vod"))
  if (rawModule.includes('reshet')) {
    if (cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(
          `${API_BASE_URL}/reshet-vod/stream?episode_id=${encodeURIComponent(cleanId)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { stream?: unknown };
          const resolved = text(data?.stream);
          if (resolved) return resolved;
        }
      } catch {}
    }
  }

  // 6. C14 VOD endpoint
  if (rawModule.includes('c14')) {
    if (cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(
          `${API_BASE_URL}/c14-vod/stream?episode_id=${encodeURIComponent(cleanId)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { stream?: unknown };
          const resolved = text(data?.stream);
          if (resolved) return resolved;
        }
      } catch {}
    }
  }

  // 7. i24 VOD endpoint
  if (rawModule.includes('i24')) {
    if (cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(
          `${API_BASE_URL}/i24-vod/stream?episode_id=${encodeURIComponent(cleanId)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as { stream?: unknown };
          const resolved = text(data?.stream);
          if (resolved) return resolved;
        }
      } catch {}
    }
  }

  // 8. Fallback: POST /vod_stream (matching Next.js & old app)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch(`${API_BASE_URL}/vod_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { stream?: unknown };
      const resolved = text(data?.stream);
      if (resolved) return resolved;
    }
  } catch {}

  return null;
}

export async function resolveVodStream(item: MediaItem): Promise<MediaStream> {
  const payload = item.sourcePayload as
    | ApiVodRecentItem
    | Record<string, unknown>
    | undefined;
  if (!payload) {
    throw new Error('VOD payload is missing');
  }

  const rawStream = await getVodStreamFromApi(payload);
  if (!rawStream) {
    throw new Error(`Cannot resolve VOD stream for item ${item.id}`);
  }

  // Build proxy URL matching Next.js and old Android app
  if (
    rawStream.includes('/proxy?url=') ||
    rawStream.includes('/v/proxy?url=')
  ) {
    return {
      url: rawStream,
      type: detectStreamType(rawStream),
    };
  }

  const module = (
    text((payload as any).module) ??
    text((payload as any).channelName) ??
    text(item.channelName) ??
    ''
  ).toLowerCase();
  const isKeshet =
    module.includes('keshet') ||
    module.includes('mako') ||
    module.includes('12') ||
    module.includes('קשת');
  const isReshet =
    module.includes('reshet') ||
    module.includes('13') ||
    module.includes('רשת');
  const isC14 =
    module.includes('c14') ||
    module.includes('14') ||
    module.includes('עכשיו');
  const isI24 = module.includes('i24') || module.includes('15');

  let referer = 'https://www.kan.org.il/';
  let useVpn = false;
  if (isKeshet) {
    referer = 'https://www.mako.co.il/';
  } else if (isReshet) {
    referer = 'https://13tv.co.il/';
    useVpn = true;
  } else if (isC14) {
    referer = 'https://tv.c14.co.il/';
  } else if (isI24) {
    referer = 'https://www.i24news.tv/';
  } else {
    referer = 'https://www.kan.org.il/';
    useVpn = true;
  }

  const endpoint = useVpn ? '/v/proxy' : '/proxy';
  const proxyUrl = `${API_BASE_URL}${endpoint}?url=${encodeURIComponent(
    rawStream,
  )}&referer=${encodeURIComponent(referer)}${useVpn ? '&vpn=true' : ''}`;

  return {
    url: proxyUrl,
    type: detectStreamType(rawStream),
  };
}

