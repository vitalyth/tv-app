import { GuideData, TvChannel, TvProgram, TvStreamSource } from '../types/guide';
import {
  VOD_PROVIDERS,
  VOD_PROVIDER_LIST,
  VodProviderInfo,
  VodEpisode,
  VodSeason,
  VodSeries,
  VodSeriesDetails,
  VodRecentItem,
} from '../types/vod';

export const PRIMARY_API_BASE = 'https://tv.bestcams.net/api';
export const FALLBACK_API_BASE = 'https://tv.bestcams.net/api';

let activeBaseUrl = PRIMARY_API_BASE;

export const setApiBaseUrl = (url: string) => {
  activeBaseUrl = url.replace(/\/api\/?$/, '') + '/api';
};

export const getApiBaseUrl = () => activeBaseUrl;

export const getWebBaseUrl = () => activeBaseUrl.replace(/\/api\/?$/, '');

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'okhttp/4.12.0',
    ...(options.headers || {}),
  };
  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchJson = async <T>(endpoint: string): Promise<T> => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  try {
    const res = await fetchWithTimeout(`${activeBaseUrl}${cleanEndpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (activeBaseUrl !== FALLBACK_API_BASE) {
      activeBaseUrl = FALLBACK_API_BASE;
      const res = await fetchWithTimeout(`${FALLBACK_API_BASE}${cleanEndpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    }
    throw err;
  }
};

const fetchText = async (endpoint: string): Promise<string> => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  try {
    const res = await fetchWithTimeout(`${activeBaseUrl}${cleanEndpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (activeBaseUrl !== FALLBACK_API_BASE) {
      activeBaseUrl = FALLBACK_API_BASE;
      const res = await fetchWithTimeout(`${FALLBACK_API_BASE}${cleanEndpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }
    throw err;
  }
};

interface PlaylistStream {
  url: string;
  label: string;
}

const parsePlaylistStreams = (content: string): Map<string, PlaylistStream[]> => {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const streams = new Map<string, PlaylistStream[]>();
  let currentKeys: string[] = [];
  let currentLabel = '';

  for (const line of lines) {
    if (line.toUpperCase().startsWith('#EXTINF')) {
      const getAttr = (name: string) => {
        const marker = `${name}="`;
        const start = line.indexOf(marker);
        if (start < 0) return '';
        return line.substring(start + marker.length).split('"')[0].trim();
      };
      const tvgId = getAttr('tvg-id');
      const tvgName = getAttr('tvg-name');
      const channelNumber = getAttr('tvg-chno');
      const commaIdx = line.lastIndexOf(',');
      const displayName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : '';

      currentKeys = [
        tvgId ? `tvg-id:${tvgId}` : '',
        tvgName ? `name:${tvgName}` : '',
        channelNumber ? `number:${channelNumber}` : '',
        displayName ? `name:${displayName}` : '',
      ].filter(Boolean);
      currentLabel = displayName || tvgName;
      continue;
    }

    if (!line.startsWith('#') && currentKeys.length > 0) {
      let streamUrl = line;
      // Kan VPN normalization matching native normalizedLiveStreamUrl()
      const kanChannels = ['ch_11', 'ch_11b', 'ch_11c', 'ch_11d', 'ch_23', 'ch_23b', 'ch_33', 'ch_33b'];
      const hasKan = kanChannels.some((k) => streamUrl.includes(`channel_id=${k}`));
      if (hasKan && !streamUrl.includes('vpn=true')) {
        streamUrl += streamUrl.includes('?') ? '&vpn=true' : '?vpn=true';
      }

      const stream: PlaylistStream = {
        url: streamUrl,
        label: currentLabel,
      };

      for (const key of currentKeys) {
        const existing = streams.get(key) || [];
        if (!existing.some((s) => s.url === streamUrl)) {
          existing.push(stream);
          streams.set(key, existing);
        }
      }
      currentKeys = [];
      currentLabel = '';
    }
  }
  return streams;
};

export const resolveImageUrl = (image?: string | null, isBackdrop = false): string | null => {
  if (!image) return null;
  const webBase = getWebBaseUrl();
  let fullUrl = image.startsWith('http://') || image.startsWith('https://')
    ? image
    : `${webBase}/${image.replace(/^\/+/, '')}`;

  const targetWidth = isBackdrop ? 1920 : 480;
  const targetHeight = isBackdrop ? 1080 : 270;
  const targetQuality = isBackdrop ? 90 : 78;

  try {
    if (fullUrl.includes('images.frp1.ott.kaltura.com')) {
      const hasQuality = /\/quality\/\d+/i.test(fullUrl);
      let cleaned = fullUrl
        .replace(/\/width\/\d+/gi, `/width/${targetWidth}`)
        .replace(/\/height\/\d+/gi, `/height/${targetHeight}`)
        .replace(/\/quality\/\d+/gi, `/quality/${targetQuality}`);
      if (!cleaned.includes('/width/')) {
        cleaned = `${cleaned.replace(/\/+$/, '')}/width/${targetWidth}/height/${targetHeight}/quality/${targetQuality}`;
      } else if (!hasQuality) {
        cleaned = `${cleaned.replace(/\/+$/, '')}/quality/${targetQuality}`;
      }
      return cleaned;
    }

    if (fullUrl.includes('/image/upload/')) {
      const marker = '/image/upload/';
      const idx = fullUrl.indexOf(marker);
      if (idx !== -1) {
        const prefix = fullUrl.substring(0, idx + marker.length);
        const suffix = fullUrl.substring(idx + marker.length);
        const parts = suffix.split('/');
        const versionIdx = parts.findIndex((p) => /^v\d+$/.test(p));
        const rest = versionIdx >= 0 ? parts.slice(versionIdx).join('/') : parts.slice(1).join('/');
        if (rest) {
          return `${prefix}c_fill,g_auto,w_${targetWidth},h_${targetHeight},q_${targetQuality},f_auto/${rest}`;
        }
      }
    }

    if (fullUrl.includes('?') && (fullUrl.includes('width=') || fullUrl.includes('w=') || fullUrl.includes('height=') || fullUrl.includes('h='))) {
      fullUrl = fullUrl
        .replace(/([?&])w(?:idth)?=\d+/gi, `$1w=${targetWidth}`)
        .replace(/([?&])h(?:eight)?=\d+/gi, `$1h=${targetHeight}`)
        .replace(/([?&])q(?:uality)?=\d+/gi, `$1q=${targetQuality}`);
      return fullUrl;
    }

    if (/[,\/]w_\d+/.test(fullUrl)) {
      fullUrl = fullUrl
        .replace(/w_\d+/gi, `w_${targetWidth}`)
        .replace(/h_\d+/gi, `h_${targetHeight}`)
        .replace(/q_\d+/gi, `q_${targetQuality}`);
      return fullUrl;
    }
  } catch {
    return fullUrl;
  }
  return fullUrl;
};

export const resolveChannelLogoUrl = (logo?: string | null): string => {
  if (!logo) return '';
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo;
  return `${getWebBaseUrl()}/ch/${logo.replace(/^\/+/, '')}`;
};

export const getProviderLogoUrl = (logoPath: string): string => {
  if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) return logoPath;
  return `${getWebBaseUrl()}/ch/${logoPath.replace(/^\/+/, '')}`;
};

// In-memory caching for zero-latency screen switching
let cachedChannels: { data: TvChannel[]; timestamp: number } | null = null;
let cachedGuideData: { data: GuideData; timestamp: number } | null = null;
let cachedRecent: { data: VodRecentItem[]; timestamp: number } | null = null;
let cachedNewVod: { data: VodRecentItem[]; timestamp: number } | null = null;
const cachedSeries: Map<string, { data: VodSeries[]; timestamp: number }> = new Map();
const CACHE_TTL_MS = 120_000; // 2 minutes

const normalizeVodProvider = (providerId?: string): VodProviderInfo => {
  if (!providerId) return VOD_PROVIDER_LIST[0];
  const p = providerId.toLowerCase();
  if (p.includes('kan') || p.includes('11')) return VOD_PROVIDERS['kan-vod'];
  if (p.includes('keshet') || p.includes('mako') || p.includes('12')) return VOD_PROVIDERS['keshet-vod'];
  if (p.includes('reshet') || p.includes('13')) return VOD_PROVIDERS['reshet-vod'];
  if (p.includes('c14') || p.includes('14')) return VOD_PROVIDERS['c14-vod'];
  if (p.includes('i24') || p.includes('15')) return VOD_PROVIDERS['i24-vod'];
  return VOD_PROVIDER_LIST.find((item) => item.id === providerId) || VOD_PROVIDER_LIST[0];
};

export const api = {
  getLiveChannels: async (forceRefresh = false): Promise<TvChannel[]> => {
    const now = Date.now();
    if (!forceRefresh && cachedChannels && now - cachedChannels.timestamp < CACHE_TTL_MS) {
      return cachedChannels.data;
    }

    const [playlistTextRes, rawRes] = await Promise.allSettled([
      fetchText('/playlist.m3u'),
      fetchJson<any[]>('/live_channels'),
    ]);

    const playlistStreams =
      playlistTextRes.status === 'fulfilled'
        ? parsePlaylistStreams(playlistTextRes.value)
        : new Map<string, PlaylistStream[]>();

    const raw = rawRes.status === 'fulfilled' ? rawRes.value : [];
    const parsedChannels: TvChannel[] = [];

    for (const item of raw) {
      if (item.type === 'radio' || item.module === 'radio') continue;

      const id = String(item.channelID || item.id || '').trim();
      if (!id) continue;

      const index = Number(item.index) || 0;
      const tvgId = String(item.tvgID || '').trim();
      const name = String(item.name || id).trim();
      const channelNumber = String(item.channelNumber || (index > 0 ? index : '')).trim();
      const logo = item.logo ? resolveChannelLogoUrl(item.logo) : null;

      const streamKeys = [
        tvgId ? `tvg-id:${tvgId}` : '',
        name ? `name:${name}` : '',
      ].filter(Boolean);
      if (streamKeys.length === 0 && channelNumber) {
        streamKeys.push(`number:${channelNumber}`);
      }

      const streams: PlaylistStream[] = [];
      for (const key of streamKeys) {
        for (const s of playlistStreams.get(key) || []) {
          if (!streams.some((existing) => existing.url === s.url)) {
            streams.push(s);
          }
        }
      }

      // Fallback if no matching streams in playlist.m3u
      if (streams.length === 0) {
        let fallbackUrl = item.linkDetails?.link || item.url || '';
        if (fallbackUrl && !fallbackUrl.startsWith('http://') && !fallbackUrl.startsWith('https://')) {
          fallbackUrl = `${getApiBaseUrl()}/stream?channel_id=${id}`;
        }
        if (fallbackUrl) {
          streams.push({ url: fallbackUrl, label: name });
        }
      }

      const sources: TvStreamSource[] = streams.map((s, idx) => {
        let channelOverride = item;
        const match = s.url.match(/channel_id=([a-zA-Z0-9_-]+)/);
        if (match && match[1] && match[1] !== (item.channelID || item.id)) {
          channelOverride = { ...item, id: match[1], channelID: match[1] };
        }
        return {
          id: s.url,
          name: s.label || `מקור ${idx + 1}`,
          url: s.url,
          isDirect: true,
          rawChannel: channelOverride,
        };
      });

      const primaryStream = sources[0]?.url || '';

      const formatTime = (sec: number) => {
        if (!sec) return '';
        const date = new Date(sec * 1000);
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      };

      const programs: TvProgram[] = Array.isArray(item.programs)
        ? item.programs.map((p: any) => {
            const startSec = Number(p.start) || 0;
            const endSec = Number(p.end) || 0;
            const timeRange = (startSec > 0 && endSec > 0) ? `${formatTime(startSec)} - ${formatTime(endSec)}` : undefined;
            return {
              id: `${id}_${p.start}`,
              channelId: id,
              title: p.name || '',
              description: p.description || '',
              imageUrl: resolveImageUrl(p.image, false),
              backdropUrl: resolveImageUrl(p.image, true),
              startSeconds: startSec,
              endSeconds: endSec,
              timeRange,
            };
          })
        : [];
      const nowSec = Math.floor(Date.now() / 1000);
      const currentProg =
        programs.find((p) => nowSec >= p.startSeconds && nowSec < p.endSeconds) ||
        programs[0] ||
        null;

      parsedChannels.push({
        id,
        index,
        name,
        number: channelNumber,
        logoUrl: logo,
        streamUrl: primaryStream,
        sources,
        currentProgram: currentProg,
        rawChannel: item,
      });
    }

    // Unify duplicates matching native distinctGuideChannels()
    const unifiedChannels: TvChannel[] = [];
    const seen = new Set<string>();

    for (const ch of parsedChannels) {
      const guideKey = ch.index && ch.index > 0 ? String(ch.index) : ch.id;
      if (!seen.has(guideKey)) {
        seen.add(guideKey);
        unifiedChannels.push(ch);
      } else {
        // Find existing channel and merge alternate stream sources
        const existing = unifiedChannels.find(
          (u) => (u.index && u.index > 0 ? String(u.index) : u.id) === guideKey
        );
        if (existing) {
          for (const s of ch.sources) {
            if (!existing.sources.some((es) => es.url === s.url)) {
              existing.sources.push({
                ...s,
                rawChannel: s.rawChannel || ch.rawChannel,
              });
            }
          }
          if (!existing.currentProgram && ch.currentProgram) {
            existing.currentProgram = ch.currentProgram;
          }
        }
      }
    }

    cachedChannels = { data: unifiedChannels, timestamp: now };
    return unifiedChannels;
  },

  getCachedGuideData: (): GuideData | null => {
    return cachedGuideData?.data || null;
  },

  getGuideData: async (forceRefresh = false): Promise<GuideData> => {
    const now = Date.now();
    if (!forceRefresh && cachedGuideData && now - cachedGuideData.timestamp < CACHE_TTL_MS) {
      return cachedGuideData.data;
    }

    const channels = await api.getLiveChannels(forceRefresh);
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor((nowSec - 3600) / 1800) * 1800;
    const endSec = startSec + 18000; // 5 hour window

    const programsByChannel: Record<string, TvProgram[]> = {};
    for (const ch of channels) {
      if (ch.currentProgram) {
        programsByChannel[ch.id] = [ch.currentProgram];
      } else {
        programsByChannel[ch.id] = [];
      }
    }

    try {
      const epg = await fetchJson<Record<string, any>>(`/epg?start=${startSec}&end=${endSec}`);
      for (const ch of channels) {
        const chPrograms = epg[ch.id] || epg[ch.number] || epg[ch.name] || [];
        if (Array.isArray(chPrograms) && chPrograms.length > 0) {
          programsByChannel[ch.id] = chPrograms.map((p: any) => ({
            id: `${ch.id}_${p.start}`,
            channelId: ch.id,
            title: p.name || p.title || '',
            description: p.description || '',
            imageUrl: resolveImageUrl(p.image, false),
            backdropUrl: resolveImageUrl(p.image, true),
            startSeconds: Number(p.start) || 0,
            endSeconds: Number(p.end) || 0,
          }));
        }
      }
    } catch {
      // EPG fallback to inline channel programs
    }

    const result: GuideData = {
      channels,
      programsByChannel,
      guideStartSeconds: startSec,
      guideEndSeconds: endSec,
    };
    cachedGuideData = { data: result, timestamp: now };
    return result;
  },

  getVodSeries: async (providerId: string, category = 'הכל', query = '', forceRefresh = false): Promise<VodSeries[]> => {
    const cacheKey = `${providerId}_${category}_${query}`;
    const now = Date.now();
    const cached = cachedSeries.get(cacheKey);
    if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const provider = normalizeVodProvider(providerId);
    const qParams: string[] = ['limit=60', 'offset=0'];
    if (query.trim()) qParams.push(`q=${encodeURIComponent(query.trim())}`);
    if (category && category !== 'הכל') qParams.push(`category=${encodeURIComponent(category.trim())}`);

    const res = await fetchJson<any>(`/${provider.endpoint}?${qParams.join('&')}`);
    const rawSeries = Array.isArray(res.series) ? res.series : [];
    const series = rawSeries.map((item: any) => ({
      id: String(item.id).trim(),
      title: item.title || '',
      description: item.description || '',
      imageUrl: resolveImageUrl(item.image, true),
      episodeCount: Number(item.episodeCount) || 0,
      seasonCount: Number(item.seasonCount) || 0,
      genre: item.program_genre || item.program_format || null,
      providerId: provider.id,
    }));

    cachedSeries.set(cacheKey, { data: series, timestamp: now });
    return series;
  },

  getVodSeriesDetails: async (providerId: string, programId: string): Promise<VodSeriesDetails> => {
    const provider = normalizeVodProvider(providerId);
    const res = await fetchJson<any>(`/${provider.endpoint}/${encodeURIComponent(programId)}`);

    const rawSeries = res.series || {};
    const series: VodSeries = {
      id: String(rawSeries.id || programId).trim(),
      title: rawSeries.title || '',
      description: rawSeries.description || '',
      imageUrl: resolveImageUrl(rawSeries.image, true),
      episodeCount: Number(rawSeries.episodeCount) || 0,
      seasonCount: Number(rawSeries.seasonCount) || 0,
      genre: rawSeries.program_genre || null,
      providerId: provider.id,
      provider: provider.id as any,
    };

    const seasons: VodSeason[] = Array.isArray(res.seasons)
      ? res.seasons.map((s: any) => ({
          seasonId: String(s.seasonId || s.id || ''),
          programId: String(programId),
          title: s.title || `עונה ${s.seasonNumber || 1}`,
          seasonNumber: Number(s.seasonNumber) || undefined,
        }))
      : [];

    const episodes: VodEpisode[] = Array.isArray(res.episodes)
      ? res.episodes.map((ep: any, idx: number) => ({
          id: String(ep.id || `${programId}_ep_${idx}`),
          programId: String(programId),
          seasonId: ep.seasonId || null,
          title: ep.title || `פרק ${idx + 1}`,
          description: ep.description || '',
          imageUrl: resolveImageUrl(ep.image, true) || series.imageUrl,
          playUrl: ep.streamUrl || ep.stream_url || ep.playUrl || ep.play_url || ep.url || null,
          streamEndpoint: ep.streamEndpoint || null,
          displayOrder: Number(ep.displayOrder || ep.episodeNumber || idx + 1),
        }))
      : [];

    return { series, seasons, episodes };
  },

  getVodRecent: async (forceRefresh = false): Promise<VodRecentItem[]> => {
    const now = Date.now();
    if (!forceRefresh && cachedRecent && now - cachedRecent.timestamp < CACHE_TTL_MS) {
      return cachedRecent.data;
    }

    try {
      const res = await fetchJson<any[]>('/vod_recent');
      if (Array.isArray(res) && res.length > 0) {
        const recent: VodRecentItem[] = res.map((item) => {
          const rawStream = item.streamUrl || item.url || item.playUrl || '';
          const directStream =
            rawStream.includes('.m3u8') ||
            rawStream.includes('.mpd') ||
            rawStream.includes('.livx') ||
            rawStream.includes('.mp4')
              ? rawStream
              : null;
          const channelLogo = item.channelImage ? resolveChannelLogoUrl(item.channelImage) : null;
          return {
            episodeId: String(item.episodeId || item.id || '').trim(),
            seriesId: item.programId ? String(item.programId).trim() : null,
            title: item.episodeName || item.name || item.title || '',
            seriesTitle: item.programName || item.seriesTitle || item.channelName || null,
            description: item.description || item.desc || item.summary || item.synopsis || null,
            imageUrl: resolveImageUrl(item.episodeImage || item.logo || item.imageUrl, true),
            playUrl: directStream,
            channelLogo: channelLogo,
            channelName: item.channelName || null,
            progressPercentage: undefined,
            rawItem: item,
          };
        });
        cachedRecent = { data: recent, timestamp: now };
        return recent;
      }
    } catch {
      // Fallback
    }
    return [];
  },

  buildPlaybackStreamUrl: (rawStreamUrl: string, provider: string = 'kan-vod'): string => {
    const cleanUrl = (rawStreamUrl || '').trim();
    if (!cleanUrl) return cleanUrl;

    if (cleanUrl.includes('/proxy?url=') || cleanUrl.includes('/v/proxy?url=')) {
      return cleanUrl;
    }

    const p = (provider || '').toLowerCase();
    const isKan =
      p.includes('kan') ||
      p.includes('11') ||
      p.includes('כאן') ||
      cleanUrl.includes('cdn-redge') ||
      cleanUrl.includes('redge.media') ||
      cleanUrl.includes('kancdn');

    const isReshet = p.includes('reshet') || p.includes('13') || p.includes('רשת');
    const isKeshet = p.includes('keshet') || p.includes('mako') || p.includes('12') || p.includes('קשת');
    const isC14 = p.includes('c14') || p.includes('14') || p.includes('עכשיו');
    const isI24 = p.includes('i24');

    let referer = 'https://www.kan.org.il/';
    let useVpnProxy = false;

    if (isKeshet) {
      referer = 'https://www.mako.co.il/';
    } else if (isReshet) {
      referer = 'https://13tv.co.il/';
      useVpnProxy = true;
    } else if (isC14) {
      referer = 'https://tv.c14.co.il/';
    } else if (isI24) {
      referer = 'https://www.i24news.tv/';
    }

    const proxyEndpoint = useVpnProxy ? '/v/proxy' : '/proxy';
    const vpnParam = useVpnProxy ? '&vpn=true' : '';
    const encodedUrl = encodeURIComponent(cleanUrl);
    const encodedReferer = encodeURIComponent(referer);

    return `${activeBaseUrl}${proxyEndpoint}?url=${encodedUrl}&referer=${encodedReferer}${vpnParam}`;
  },

  resolveEpisodeStream: async (
    streamEndpoint?: string | null,
    provider: string = 'kan-vod',
    fallbackPlayUrl?: string | null,
    episodeId?: string | null
  ): Promise<string | null> => {
    let rawStream: string | null = null;

    // 0. Direct stream URL fast-path (.m3u8, .mpd, .livx, .mp4)
    if (streamEndpoint && streamEndpoint.trim().length > 0) {
      const ep = streamEndpoint.trim();
      if (
        ep.includes('.m3u8') ||
        ep.includes('.mpd') ||
        ep.includes('.livx') ||
        ep.includes('.mp4')
      ) {
        rawStream = ep;
      }
    }

    if (!rawStream && fallbackPlayUrl && fallbackPlayUrl.trim().length > 0) {
      const fb = fallbackPlayUrl.trim();
      if (
        fb.includes('.m3u8') ||
        fb.includes('.mpd') ||
        fb.includes('.livx') ||
        fb.includes('.mp4')
      ) {
        rawStream = fb;
      }
    }

    // 1. streamEndpoint as an API endpoint (only if NOT already a stream URL)
    if (!rawStream && streamEndpoint && streamEndpoint.trim().length > 0) {
      const cleanEndpoint = streamEndpoint.trim();
      const url =
        cleanEndpoint.startsWith('http://') || cleanEndpoint.startsWith('https://')
          ? cleanEndpoint
          : cleanEndpoint.startsWith('/api/')
            ? `${activeBaseUrl}${cleanEndpoint.replace(/^\/api/, '')}`
            : cleanEndpoint.startsWith('/')
              ? `${activeBaseUrl}${cleanEndpoint}`
              : `${activeBaseUrl}/${cleanEndpoint}`;

      try {
        const res = await fetchWithTimeout(url, {}, 8000);
        if (res.ok) {
          const data = await res.json();
          if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
            rawStream = data.stream.trim();
          }
        }
      } catch {}
    }

    // 2. Direct specialized stream endpoint if episodeId available
    if (!rawStream && episodeId) {
      const cleanEpId = episodeId.replace(
        /^(kan-vod:|keshet-vod:|reshet-vod:|c14-vod:|i24-vod:|kan_|mako_|keshet_|reshet_|c14_|i24_)/i,
        ''
      );
      const effectiveEpId = cleanEpId || episodeId;
      const p = (provider || '').toLowerCase();

      if (p.includes('reshet') || p.includes('13') || p.includes('רשת')) {
        try {
          const epUrl = `${activeBaseUrl}/reshet-vod/stream?episode_id=${encodeURIComponent(effectiveEpId)}`;
          const res = await fetchWithTimeout(epUrl, {}, 8000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
              rawStream = data.stream.trim();
            }
          }
        } catch {}
      } else if (p.includes('keshet') || p.includes('mako') || p.includes('12') || p.includes('קשת')) {
        try {
          const epUrl = `${activeBaseUrl}/keshet-vod/stream?episode_id=${encodeURIComponent(effectiveEpId)}`;
          const res = await fetchWithTimeout(epUrl, {}, 8000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
              rawStream = data.stream.trim();
            }
          }
        } catch {}
      } else if (p.includes('c14') || p.includes('14') || p.includes('עכשיו')) {
        try {
          const epUrl = `${activeBaseUrl}/c14-vod/stream?episode_id=${encodeURIComponent(effectiveEpId)}`;
          const res = await fetchWithTimeout(epUrl, {}, 8000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
              rawStream = data.stream.trim();
            }
          }
        } catch {}
      } else if (p.includes('i24') || p.includes('15')) {
        try {
          const epUrl = `${activeBaseUrl}/i24-vod/stream?episode_id=${encodeURIComponent(effectiveEpId)}`;
          const res = await fetchWithTimeout(epUrl, {}, 8000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
              rawStream = data.stream.trim();
            }
          }
        } catch {}
      } else if (p.includes('kan') || p.includes('11') || p.includes('כאן')) {
        try {
          const epUrl = `${activeBaseUrl}/kan-vod/stream?episode_id=${encodeURIComponent(effectiveEpId)}`;
          const res = await fetchWithTimeout(epUrl, {}, 8000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
              rawStream = data.stream.trim();
            }
          }
        } catch {}
      }
    }

    // 3. Fallback /vod_stream POST (matching Next.js channelService.getVodStream)
    if (!rawStream && episodeId) {
      const cleanEpId = episodeId.replace(
        /^(kan-vod:|keshet-vod:|reshet-vod:|c14-vod:|i24-vod:|kan_|mako_|keshet_|reshet_|c14_|i24_)/i,
        ''
      );
      const effectiveEpId = cleanEpId || episodeId;
      try {
        const res = await fetchWithTimeout(
          `${activeBaseUrl}/vod_stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: effectiveEpId,
              episodeId: effectiveEpId,
              module: provider,
              url: fallbackPlayUrl || '',
              streamUrl: fallbackPlayUrl || '',
            }),
          },
          8000
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
            rawStream = data.stream.trim();
          }
        }
      } catch {}
    }

    if (!rawStream) return null;

    return api.buildPlaybackStreamUrl(rawStream, provider);
  },

  getVodEpisodeStream: async (item: VodRecentItem): Promise<string | null> => {
    if (!item) return null;

    const rawModule = (item.rawItem?.module || item.rawItem?.provider || (item as any)?.module || '').toLowerCase();
    const rawChanName = (item.channelName || (item as any)?.channelName || '').toLowerCase();
    const rawSeriesTitle = (item.seriesTitle || (item as any)?.seriesTitle || '').toLowerCase();
    const rawId = String(item.episodeId || item.rawItem?.id || (item as any)?.id || '').trim();

    // Determine provider key accurately
    let providerKey = 'kan-vod';
    if (
      rawModule.includes('keshet') ||
      rawModule.includes('mako') ||
      rawChanName.includes('קשת') ||
      rawChanName.includes('12') ||
      rawSeriesTitle.includes('קשת') ||
      rawId.startsWith('keshet') ||
      rawId.startsWith('mako')
    ) {
      providerKey = 'keshet-vod';
    } else if (
      rawModule.includes('reshet') ||
      rawChanName.includes('רשת') ||
      rawChanName.includes('13') ||
      rawSeriesTitle.includes('רשת') ||
      rawId.startsWith('reshet')
    ) {
      providerKey = 'reshet-vod';
    } else if (
      rawModule.includes('c14') ||
      rawChanName.includes('14') ||
      rawChanName.includes('עכשיו') ||
      rawId.startsWith('c14')
    ) {
      providerKey = 'c14-vod';
    } else if (
      rawModule.includes('i24') ||
      rawChanName.includes('i24') ||
      rawId.startsWith('i24')
    ) {
      providerKey = 'i24-vod';
    }

    // 0. Fast-path: Check if item already has a direct stream URL (.m3u8, .mpd, .mp4, .livx)
    const candidateStream =
      item.rawItem?.streamUrl ||
      (item as any).streamUrl ||
      (item as any).url ||
      (item.rawItem?.url && typeof item.rawItem.url === 'string' && (item.rawItem.url.includes('.m3u8') || item.rawItem.url.includes('.mpd')) ? item.rawItem.url : null) ||
      (item.playUrl && typeof item.playUrl === 'string' && (item.playUrl.includes('.m3u8') || item.playUrl.includes('.mpd')) ? item.playUrl : null);

    if (
      candidateStream &&
      (candidateStream.includes('.m3u8') ||
        candidateStream.includes('.mpd') ||
        candidateStream.includes('.mp4') ||
        candidateStream.includes('.livx'))
    ) {
      return api.buildPlaybackStreamUrl(candidateStream, providerKey);
    }

    // Clean provider prefixes from episode ID
    const cleanEpisodeId = rawId.replace(
      /^(kan-vod:|keshet-vod:|reshet-vod:|c14-vod:|i24-vod:|kan_|mako_|keshet_|reshet_|c14_|i24_)/i,
      ''
    );

    let stream: string | null = null;

    // 1. Direct resolution using resolveEpisodeStream
    if (cleanEpisodeId || rawId || item.rawItem?.streamEndpoint) {
      stream = await api.resolveEpisodeStream(
        item.rawItem?.streamEndpoint || item.rawItem?.streamUrl,
        providerKey,
        item.rawItem?.streamUrl || item.rawItem?.url || (item as any).url || item.playUrl,
        cleanEpisodeId || rawId
      );
    }

    // 2. If stream is still null, look up series details to find the episode or first episode
    const targetSeriesId = item.seriesId || item.rawItem?.programId;
    if (!stream && targetSeriesId) {
      try {
        const details = await api.getVodSeriesDetails(providerKey, targetSeriesId);
        if (details && details.episodes && details.episodes.length > 0) {
          const matchedEp = cleanEpisodeId
            ? details.episodes.find((e) => e.id === cleanEpisodeId || e.id.endsWith(cleanEpisodeId)) || details.episodes[0]
            : details.episodes[0];
          if (matchedEp) {
            stream = await api.resolveEpisodeStream(
              matchedEp.streamEndpoint,
              providerKey,
              matchedEp.playUrl || (matchedEp as any).streamUrl,
              matchedEp.id
            );
          }
        }
      } catch (err) {
        console.warn('Failed to resolve series episodes for stream:', err);
      }
    }

    // 3. Fallback POST to /vod_stream with raw item payload (matching Next.js channelService.getVodStream)
    if (!stream && (cleanEpisodeId || rawId)) {
      try {
        const payload = {
          id: cleanEpisodeId || rawId,
          episodeId: cleanEpisodeId || rawId,
          module: providerKey,
          provider: providerKey,
          ...(item.rawItem || {}),
        };
        const res = await fetchWithTimeout(
          `${activeBaseUrl}/vod_stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          8000
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.stream && typeof data.stream === 'string' && data.stream.trim().length > 0) {
            stream = api.buildPlaybackStreamUrl(data.stream.trim(), providerKey);
          }
        }
      } catch {}
    }

    return stream;
  },

  getNewVodContent: async (forceRefresh = false): Promise<VodRecentItem[]> => {
    const now = Date.now();
    if (!forceRefresh && cachedNewVod && now - cachedNewVod.timestamp < CACHE_TTL_MS) {
      return cachedNewVod.data;
    }

    try {
      const recent = await api.getVodRecent(forceRefresh);

      // Check if Reshet 13 is in the recent items; if not, add recent Reshet 13 episodes
      const hasReshet = recent.some(
        (it) =>
          it.channelName?.includes('13') ||
          it.channelName?.includes('רשת') ||
          it.seriesTitle?.includes('13') ||
          it.seriesTitle?.includes('רשת')
      );
      if (!hasReshet) {
        try {
          const reshetDetails = await api.getVodSeriesDetails('reshet-vod', '294');
          if (reshetDetails && reshetDetails.episodes && reshetDetails.episodes.length > 0) {
            const reshetItems: VodRecentItem[] = reshetDetails.episodes.slice(0, 3).map((ep) => ({
              episodeId: ep.id,
              seriesId: '294',
              title: ep.title,
              seriesTitle: 'רשת 13',
              description: ep.description || reshetDetails.series.description || 'היום שהיה עם גיא לרר',
              imageUrl: ep.imageUrl || reshetDetails.series.imageUrl,
              playUrl: ep.playUrl,
              channelLogo: resolveChannelLogoUrl('13.jpg'),
              channelName: 'רשת 13',
              progressPercentage: undefined,
              rawItem: {
                id: ep.id,
                episodeId: ep.id,
                streamEndpoint: ep.streamEndpoint,
                streamUrl: ep.playUrl,
                module: 'reshet-vod',
                provider: 'reshet-vod',
              },
            }));
            recent.splice(2, 0, ...reshetItems);
          }
        } catch {}
      }

      if (recent.length >= 10) {
        cachedNewVod = { data: recent, timestamp: now };
        return recent;
      }

      const [kanSeries, makoSeries] = await Promise.allSettled([
        api.getVodSeries('kan11', 'הכל', '', false),
        api.getVodSeries('mako', 'הכל', '', false),
      ]);

      const extraItems: VodRecentItem[] = [];
      const kanList = kanSeries.status === 'fulfilled' ? kanSeries.value : [];
      const makoList = makoSeries.status === 'fulfilled' ? makoSeries.value : [];

      for (const s of kanList.slice(0, 8)) {
        extraItems.push({
          episodeId: `kan_${s.id}`,
          seriesId: s.id,
          title: s.title,
          seriesTitle: 'כאן 11',
          description: s.description || null,
          imageUrl: s.imageUrl,
          playUrl: null,
          channelLogo: resolveChannelLogoUrl('kan.jpg'),
          channelName: 'כאן 11',
          progressPercentage: undefined,
        });
      }

      for (const s of makoList.slice(0, 8)) {
        extraItems.push({
          episodeId: `mako_${s.id}`,
          seriesId: s.id,
          title: s.title,
          seriesTitle: 'קשת 12',
          description: s.description || null,
          imageUrl: s.imageUrl,
          playUrl: null,
          channelLogo: resolveChannelLogoUrl('12tv.jpg'),
          channelName: 'קשת 12',
          progressPercentage: undefined,
        });
      }

      const combined = [...recent, ...extraItems].slice(0, 14);
      cachedNewVod = { data: combined, timestamp: now };
      return combined;
    } catch {
      return [];
    }
  },

  getLiveChannelStream: async (rawChannel: any): Promise<string | null> => {
    if (!rawChannel) return null;
    try {
      const chId = String(rawChannel?.channelID || rawChannel?.id || '').toLowerCase();
      const isKanLive =
        chId.startsWith('ch_11') ||
        chId.startsWith('ch_23') ||
        chId.startsWith('ch_33') ||
        Boolean(rawChannel?.linkDetails?.vpn);

      const endpoint = isKanLive ? '/v/live_channel' : '/live_channel';
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const res = await fetchWithTimeout(
        `${activeBaseUrl}${cleanEndpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(rawChannel),
        },
        7000
      );
      if (!res.ok) return null;
      const data = await res.json();
      let stream = data?.stream || null;
      if (stream) {
        if (
          stream.includes('cdn-redge') ||
          stream.includes('redge.media') ||
          stream.includes('kancdn')
        ) {
          stream = api.buildPlaybackStreamUrl(stream, 'kan-vod');
        } else if (isKanLive && !stream.includes('vpn=true')) {
          stream += stream.includes('?') ? '&vpn=true' : '?vpn=true';
        }
      }
      return stream;
    } catch (err) {
      console.warn('getLiveChannelStream error:', err);
      return null;
    }
  },

  getVodStream: async (item: any): Promise<string | null> => {
    if (!item) return null;
    try {
      if (item?.streamEndpoint) {
        const endpoint = String(item.streamEndpoint).replace(/^\/api(?=\/)/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const res = await fetchWithTimeout(`${activeBaseUrl}${cleanEndpoint}`, {}, 7000);
        if (res.ok) {
          const data = await res.json();
          if (data?.stream) return data.stream;
        }
      }

      if (item?.module === 'kan-vod' || item?.vodChannelId === 'vod_kan11') {
        const episodeId = item?.episodeId || item?.id?.replace?.('kan-vod:', '') || '';
        if (episodeId) {
          const endpoint = `/kan-vod/stream?episode_id=${encodeURIComponent(episodeId)}`;
          const res = await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, {}, 7000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream) return data.stream;
          }
        }
      }

      if (item?.module === 'reshet-vod') {
        const episodeId = item?.episodeId || item?.id || '';
        if (episodeId) {
          const endpoint = `/reshet-vod/stream?episode_id=${encodeURIComponent(episodeId)}`;
          const res = await fetchWithTimeout(`${activeBaseUrl}${endpoint}`, {}, 7000);
          if (res.ok) {
            const data = await res.json();
            if (data?.stream) return data.stream;
          }
        }
      }

      const res = await fetchWithTimeout(
        `${activeBaseUrl}/vod_stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        },
        7000
      );
      if (res.ok) {
        const data = await res.json();
        return data?.stream || null;
      }
    } catch (err) {
      console.warn('getVodStream error:', err);
    }
    return null;
  },
};

export default api;
