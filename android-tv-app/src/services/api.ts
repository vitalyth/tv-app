import { GuideData, TvChannel, TvProgram, TvStreamSource } from '../types/guide';
import {
  VOD_PROVIDERS,
  VOD_PROVIDER_LIST,
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

  const targetWidth = isBackdrop ? 1280 : 480;
  const targetHeight = isBackdrop ? 720 : 270;
  const targetQuality = isBackdrop ? 85 : 78;

  try {
    if (fullUrl.includes('images.frp1.ott.kaltura.com')) {
      fullUrl = fullUrl
        .replace(/\/width\/\d+/gi, `/width/${targetWidth}`)
        .replace(/\/height\/\d+/gi, `/height/${targetHeight}`)
        .replace(/\/quality\/\d+/gi, `/quality/${targetQuality}`);
      if (!fullUrl.includes('/width/')) {
        fullUrl = `${fullUrl.replace(/\/+$/, '')}/width/${targetWidth}/height/${targetHeight}/quality/${targetQuality}`;
      }
      return fullUrl;
    }
    if (fullUrl.includes('media3.reshet.tv/image/upload/')) {
      const marker = '/image/upload/';
      const idx = fullUrl.indexOf(marker);
      if (idx !== -1) {
        const prefix = fullUrl.substring(0, idx + marker.length);
        const suffix = fullUrl.substring(idx + marker.length);
        if (!suffix.startsWith('c_') && !suffix.startsWith('w_')) {
          return `${prefix}c_fill,g_auto,w_${targetWidth},h_${targetHeight},q_${targetQuality},f_auto/${suffix}`;
        }
      }
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
let cachedRecent: { data: VodRecentItem[]; timestamp: number } | null = null;
const cachedSeries: Map<string, { data: VodSeries[]; timestamp: number }> = new Map();
const CACHE_TTL_MS = 120_000; // 2 minutes

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
              imageUrl: resolveImageUrl(p.image),
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

  getGuideData: async (): Promise<GuideData> => {
    const channels = await api.getLiveChannels();
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
            imageUrl: resolveImageUrl(p.image),
            startSeconds: Number(p.start) || 0,
            endSeconds: Number(p.end) || 0,
          }));
        }
      }
    } catch {
      // EPG fallback to inline channel programs
    }

    return {
      channels,
      programsByChannel,
      guideStartSeconds: startSec,
      guideEndSeconds: endSec,
    };
  },

  getVodSeries: async (providerId: string, category = 'הכל', query = '', forceRefresh = false): Promise<VodSeries[]> => {
    const cacheKey = `${providerId}_${category}_${query}`;
    const now = Date.now();
    const cached = cachedSeries.get(cacheKey);
    if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const provider = VOD_PROVIDER_LIST.find((p) => p.id === providerId) || VOD_PROVIDER_LIST[0];
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
    const provider = VOD_PROVIDER_LIST.find((p) => p.id === providerId) || VOD_PROVIDER_LIST[0];
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
          playUrl: ep.playUrl || ep.url || null,
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

  getVodEpisodeStream: async (item: VodRecentItem): Promise<string | null> => {
    if (!item) return null;
    let rawStream: string | null = null;

    const isDirectStream = (url?: string | null) =>
      !!url &&
      (url.includes('.m3u8') ||
        url.includes('.mpd') ||
        url.includes('.livx') ||
        url.includes('.mp4'));

    // 1. Direct stream on item
    if (isDirectStream(item.playUrl)) {
      rawStream = item.playUrl || null;
    }

    // 2. Direct stream on rawItem
    if (!rawStream && isDirectStream(item.rawItem?.streamUrl)) {
      rawStream = item.rawItem.streamUrl;
    }

    // 3. Resolve via specialized VOD endpoint or /vod_stream
    if (!rawStream) {
      const raw = item.rawItem || {
        id: item.episodeId,
        episodeId: item.episodeId,
        url: item.playUrl,
        seriesId: item.seriesId,
        channelName: item.channelName,
      };

      if (!raw.module) {
        const ch = (item.channelName || item.seriesTitle || '').toLowerCase();
        if (ch.includes('11') || ch.includes('כאן')) raw.module = 'kan-vod';
        else if (ch.includes('12') || ch.includes('קשת') || ch.includes('mako')) raw.module = 'keshet-vod';
        else if (ch.includes('13') || ch.includes('רשת')) raw.module = 'reshet-vod';
        else if (ch.includes('14')) raw.module = 'c14-vod';
        else if (ch.includes('i24')) raw.module = 'i24-vod';
      }

      const resolved = await api.getVodStream(raw);
      if (resolved && isDirectStream(resolved)) {
        rawStream = resolved;
      }
    }

    // 4. If still not resolved and has seriesId, try loading series details
    if (!rawStream && item.seriesId) {
      try {
        const provider =
          item.channelName?.includes('12') || item.seriesTitle?.includes('קשת')
            ? 'mako'
            : 'kan11';
        const details = await api.getVodSeriesDetails(provider, item.seriesId);
        if (details?.episodes?.length > 0) {
          const target =
            details.episodes.find((e) => e.id === item.episodeId) ||
            details.episodes[0];
          if (target) {
            if (isDirectStream(target.playUrl)) {
              rawStream = target.playUrl || null;
            } else {
              const resStream = await api.getVodStream({
                ...target,
                module: provider === 'mako' ? 'keshet-vod' : 'kan-vod',
              });
              if (resStream && isDirectStream(resStream)) {
                rawStream = resStream;
              }
            }
          }
        }
      } catch {}
    }

    if (!rawStream) return null;

    if (rawStream.includes('/proxy?url=') || rawStream.includes('/v/proxy?url=')) {
      return rawStream;
    }

    const module = (item.rawItem?.module || '').toLowerCase();
    const chName = (item.channelName || item.seriesTitle || '').toLowerCase();

    const requiresVpn =
      rawStream.includes('cdn-redge') ||
      rawStream.includes('redge.media') ||
      rawStream.includes('kancdn') ||
      module.includes('reshet') ||
      chName.includes('רשת');

    const cleanEndpoint = requiresVpn ? '/v/proxy' : '/proxy';
    const vpnParam = requiresVpn ? '&vpn=true' : '';

    let referer = 'https://www.kan.org.il/';
    if (module.includes('keshet') || chName.includes('קשת') || chName.includes('12') || chName.includes('mako')) {
      referer = 'https://www.mako.co.il/';
    } else if (module.includes('reshet') || chName.includes('רשת') || chName.includes('13')) {
      referer = 'https://13tv.co.il/';
    } else if (module.includes('14') || chName.includes('14')) {
      referer = 'https://www.c14.co.il/';
    } else if (module.includes('i24') || chName.includes('i24')) {
      referer = 'https://www.i24news.tv/';
    }

    return `${activeBaseUrl}${cleanEndpoint}?url=${encodeURIComponent(rawStream)}&referer=${encodeURIComponent(referer)}${vpnParam}`;
  },

  getNewVodContent: async (): Promise<VodRecentItem[]> => {
    try {
      const recent = await api.getVodRecent();
      if (recent.length >= 10) return recent;

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

      return [...recent, ...extraItems].slice(0, 14);
    } catch {
      return [];
    }
  },

  getLiveChannelStream: async (rawChannel: any): Promise<string | null> => {
    if (!rawChannel) return null;
    try {
      const endpoint = rawChannel?.linkDetails?.vpn ? '/v/live_channel' : '/live_channel';
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
      return data?.stream || null;
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
