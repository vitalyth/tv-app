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

export type KanVodSeriesResponse = {
  db: string;
  count: number;
  series: KanVodSeries[];
  error?: string | null;
};

export const kanVodService = {
  async getSeries(refresh = false): Promise<KanVodSeriesResponse> {
    const searchParams = refresh ? "?refresh=true" : "";
    return fetchJson<KanVodSeriesResponse>(
      `/v/kan-vod${searchParams}`,
      "Failed to load Kan VOD",
      (data) => {
        if (data.error && !data.series?.length) {
          throw new Error(data.error);
        }
      }
    );
  },

  async getSeriesList(refresh = false): Promise<KanVodSeries[]> {
    const data = await this.getSeries(refresh);
    return data.series || [];
  },

  async getSeriesDetails(programId: string, refresh = false): Promise<KanVodSeriesDetails> {
    const searchParams = refresh ? "?refresh=true" : "";
    return fetchJson<KanVodSeriesDetails>(
      `/v/kan-vod/${encodeURIComponent(programId)}${searchParams}`,
      "Failed to load Kan VOD series",
      (data) => {
        if (data.error && !data.episodes?.length) {
          throw new Error(data.error);
        }
      }
    );
  },
};
