import { getJson } from './client';
import { resolveVodImage, toVodMediaItem } from './vod';
import type { MediaItem } from '../media/player';

export const VOD_PROVIDERS = [
  { id: 'kan', label: 'Kan 11' },
  { id: 'keshet', label: 'Keshet 12' },
  { id: 'reshet', label: 'Reshet 13' },
  { id: 'c14', label: 'Now 14' },
  { id: 'i24', label: 'i24' },
] as const;
export type VodProviderId = (typeof VOD_PROVIDERS)[number]['id'];

export interface VodSeries {
  id: string;
  title: string;
  description?: string;
  image?: string;
}
export interface VodSeason {
  season_id: string;
  title: string;
}
export interface VodEpisode {
  id: string;
  season_id?: string | null;
  title?: string;
  description?: string;
  image?: string;
  episodeName?: string;
  episodeOverview?: string;
  episodeImage?: string;
  streamEndpoint?: string;
  streamUrl?: string;
  playUrl?: string;
  stream_url?: string;
  play_url?: string;
  url?: string;
}
export interface VodSeriesDetails extends VodSeries {
  seasons: VodSeason[];
  episodes: VodEpisode[];
}
export interface VodCatalogPage {
  series: VodSeries[];
  categories: string[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
function cached<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) {
    return hit.value as Promise<T>;
  }
  const value = getJson<unknown>(path)
    .then(parse)
    .catch(error => {
      if (cache.get(path)?.value === value) {
        cache.delete(path);
      }
      throw error;
    });
  cache.delete(path);
  cache.set(path, { expires: Date.now() + 60000, value });
  if (cache.size > 12) {
    cache.delete(cache.keys().next().value!);
  }
  return value;
}

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid VOD response');
  }
  return raw as Record<string, unknown>;
}
function identifier(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim()
    ? raw
    : typeof raw === 'number'
    ? String(raw)
    : undefined;
}
function seriesItem(raw: unknown): VodSeries | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const item = raw as Record<string, unknown>;
  const id = identifier(item.id);
  const title = typeof item.title === 'string' ? item.title : undefined;
  return id && title
    ? {
        id,
        title,
        description:
          typeof item.description === 'string' ? item.description : undefined,
        image: typeof item.image === 'string' ? item.image : undefined,
      }
    : undefined;
}

export function getVodCatalog(
  provider: VodProviderId,
  options: { query?: string; category?: string; offset?: number } = {},
): Promise<VodCatalogPage> {
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    limit: '40',
    offset: String(offset),
    ...(options.query?.trim() ? { q: options.query.trim() } : {}),
    ...(options.category ? { category: options.category } : {}),
  });
  return cached(`/${provider}-vod?${params.toString()}`, raw => {
    const data = record(raw);
    if (!Array.isArray(data.series) || (data.error && !data.series.length)) {
      throw new Error('VOD catalog unavailable');
    }
    const series = data.series
      .map(seriesItem)
      .filter((item): item is VodSeries => Boolean(item));
    const categoryNames = Array.isArray(data.categories) ? data.categories : [];
    const categories = Array.isArray(data.categoryOptions)
      ? data.categoryOptions.map(option =>
          option && typeof option === 'object'
            ? (option as Record<string, unknown>).name
            : undefined,
        )
      : categoryNames;
    return {
      series,
      categories: categories.filter(
        (name): name is string =>
          typeof name === 'string' && Boolean(name.trim()),
      ),
      total: typeof data.total === 'number' ? data.total : series.length,
      hasMore: data.hasMore === true && data.series.length > 0,
      nextOffset: offset + data.series.length,
    };
  });
}

export function getVodSeriesDetails(
  provider: VodProviderId,
  id: string,
): Promise<VodSeriesDetails> {
  return cached(`/${provider}-vod/${encodeURIComponent(id)}`, raw => {
    const data = record(raw);
    const series = seriesItem(data);
    if (
      !series ||
      !Array.isArray(data.episodes) ||
      (data.error && !data.episodes.length)
    ) {
      throw new Error('VOD series unavailable');
    }
    return {
      ...series,
      seasons: (Array.isArray(data.seasons) ? data.seasons : []).flatMap(
        rawSeason => {
          if (!rawSeason || typeof rawSeason !== 'object') {
            return [];
          }
          const season = rawSeason as Record<string, unknown>;
          const seasonId = identifier(season.season_id);
          return seasonId
            ? [
                {
                  season_id: seasonId,
                  title:
                    typeof season.title === 'string' ? season.title : seasonId,
                },
              ]
            : [];
        },
      ),
      episodes: data.episodes.flatMap(rawEpisode => {
        if (!rawEpisode || typeof rawEpisode !== 'object') {
          return [];
        }
        const episode = rawEpisode as VodEpisode;
        const episodeId = identifier(episode.id);
        return episodeId
          ? [
              {
                ...episode,
                id: episodeId,
                season_id: identifier(episode.season_id),
              },
            ]
          : [];
      }),
    };
  });
}

export function vodSeriesMediaItem(
  series: VodSeries,
  provider: VodProviderId,
): MediaItem {
  const images = resolveVodImage({
    image: series.image,
    module: `${provider}-vod`,
  });
  return {
    id: `series-${provider}-${series.id}`,
    kind: 'vod',
    title: series.title,
    programName: series.title,
    channelName: VOD_PROVIDERS.find(item => item.id === provider)?.label,
    description: series.description,
    ...images,
  };
}

export function vodEpisodeMediaItem(
  episode: VodEpisode,
  series: VodSeriesDetails,
  provider: VodProviderId,
): MediaItem {
  return toVodMediaItem({
    ...episode,
    episodeId: `${provider}-vod:${episode.id}`,
    module: `${provider}-vod`,
    programId: series.id,
    programName: series.title,
    programImage: series.image,
    programDescription: series.description,
    channelName: VOD_PROVIDERS.find(item => item.id === provider)?.label,
    seasonName: series.seasons.find(
      season => season.season_id === episode.season_id,
    )?.title,
    episodeName: episode.episodeName || episode.title,
    episodeDescription: episode.episodeOverview || episode.description,
    streamUrl: episode.streamUrl || episode.stream_url,
    playUrl: episode.playUrl || episode.play_url,
    streamEndpoint:
      episode.streamEndpoint ||
      `/${provider}-vod/stream?episode_id=${encodeURIComponent(episode.id)}`,
  })!;
}
