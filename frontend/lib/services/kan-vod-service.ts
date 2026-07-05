import { api } from "@/lib/api";

const fetchJson = async <T>(
  path: string,
  errorMessage: string,
  validate?: (data: T) => void
): Promise<T> => {
  const response = await fetch(api(path), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${errorMessage} (${response.status})`);
  }

  const data = await response.json() as T;
  validate?.(data);
  return data;
};

export type KanVodSeries = {
  id: string;
  mainid?: string;
  title: string;
  description?: string;
  url: string;
  image?: string | null;
  program_format?: string | null;
  program_genre?: string | null;
  episodeCount: number;
  seasonCount: number;
  streamCount: number;
  latestKanEpisodeId?: number;
  latestEpisodePublished?: string | null;
};

export type KanVodSeason = {
  season_id: string;
  program_id: string;
  title: string;
  url: string;
  season_number?: number | null;
};

export type KanVodEpisode = {
  id: string;
  program_id: string;
  season_id?: string | null;
  title: string;
  description?: string;
  url: string;
  image?: string | null;
  play_url?: string | null;
  stream_url?: string | null;
  streamUrl: string;
  playUrl: string;
  episodeName: string;
  episodeOverview: string;
  episodeImage: string;
  streamEndpoint: string;
  published?: string | null;
};

export type KanVodSeriesDetails = KanVodSeries & {
  seasons: KanVodSeason[];
  episodes: KanVodEpisode[];
  error?: string | null;
};

export type KanVodNextEpisode = {
  programId: string;
  episode: KanVodEpisode;
};

export type KanVodSeriesResponse = {
  db: string;
  count: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  query?: string;
  category?: string;
  selectedCategories?: string[];
  categories?: string[];
  series: KanVodSeries[];
  error?: string | null;
};

export const kanVodService = {
  async getSeries({
    refresh = false,
    query = "",
    category = [],
    limit = 60,
    offset = 0,
  }: {
    refresh?: boolean;
    query?: string;
    category?: string | string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<KanVodSeriesResponse> {
    const params = new URLSearchParams();
    if (refresh) params.set("refresh", "true");
    if (query.trim()) params.set("q", query.trim());
    const categories = Array.isArray(category) ? category : [category];
    categories
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => params.append("category", item));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const searchParams = `?${params.toString()}`;

    return fetchJson<KanVodSeriesResponse>(
      `/kan-vod${searchParams}`,
      "Failed to load Kan VOD",
      (data) => {
        if (data.error && !data.series?.length) {
          throw new Error(data.error);
        }
      }
    );
  },

  async getSeriesList(refresh = false): Promise<KanVodSeries[]> {
    const data = await this.getSeries({ refresh, limit: 120 });
    return data.series || [];
  },

  async getSeriesDetails(programId: string, refresh = false): Promise<KanVodSeriesDetails> {
    const searchParams = refresh ? "?refresh=true" : "";
    return fetchJson<KanVodSeriesDetails>(
      `/kan-vod/${encodeURIComponent(programId)}${searchParams}`,
      "Failed to load Kan VOD series",
      (data) => {
        if (data.error && !data.episodes?.length) {
          throw new Error(data.error);
        }
      }
    );
  },

  async getNextEpisode(episodeId: string): Promise<KanVodNextEpisode | null> {
    const response = await fetch(
      api(`/kan-vod/next?episode_id=${encodeURIComponent(episodeId)}`),
      { cache: "no-store" },
    );

    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to load next Kan VOD episode (${response.status})`);
    }

    return await response.json() as KanVodNextEpisode;
  },

};
