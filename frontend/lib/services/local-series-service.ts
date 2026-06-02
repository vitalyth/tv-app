import { api } from "@/lib/api";

export type LocalSeriesMetadata = {
  tmdbId?: number;
  name?: string;
  originalName?: string;
  overview?: string;
  tagline?: string;
  homepage?: string;
  status?: string;
  type?: string;
  firstAirDate?: string;
  lastAirDate?: string;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  episodeRunTime?: number[];
  rating?: number;
  voteCount?: number;
  popularity?: number;
  poster?: string | null;
  backdrop?: string | null;
  genres?: string[];
  networks?: Array<{
    id?: number;
    name?: string;
    logo?: string | null;
    country?: string;
  }>;
  seasons?: Array<{
    id?: number;
    seasonNumber?: number;
    name?: string;
    overview?: string;
    airDate?: string;
    episodeCount?: number;
    poster?: string | null;
    rating?: number;
  }>;
  cast?: Array<{
    id?: number;
    name?: string;
    character?: string;
    profile?: string | null;
  }>;
  externalIds?: Record<string, string | number | null>;
  videos?: Array<{
    name?: string;
    site?: string;
    type?: string;
    key?: string;
    url?: string | null;
  }>;
};

export type LocalEpisode = {
  id: string;
  filename: string;
  path: string;
  season?: number | null;
  episode?: number | null;
  episodeName?: string | null;
  episodeOverview?: string | null;
  episodeImage?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  screenSize?: string;
  source?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  mimetype?: string;
  streamUrl: string;
  parsed?: Record<string, unknown>;
};

export type LocalSeries = {
  id: string;
  title: string;
  metadata: LocalSeriesMetadata | null;
  episodes: LocalEpisode[];
};

export type LocalSeriesResponse = {
  root: string;
  count: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  query?: string;
  series: LocalSeries[];
  error?: string;
};

export const localSeriesService = {
  async getSeries({
    refresh = false,
    query = "",
    limit = 60,
    offset = 0,
  }: {
    refresh?: boolean;
    query?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<LocalSeriesResponse> {
    const params = new URLSearchParams();
    if (refresh) params.set("refresh", "true");
    if (query.trim()) params.set("q", query.trim());
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const response = await fetch(api(`/local-series?${params.toString()}`), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load local series");
    }

    return response.json();
  },

  async getSeriesList(): Promise<LocalSeries[]> {
    const data = await this.getSeries({ limit: 120 });
    return data.series || [];
  },
};
