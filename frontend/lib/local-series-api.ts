export type LocalEpisode = {
  id: string;
  filename: string;
  path: string;
  season?: number;
  episode?: number;
  streamUrl: string;
};

export type LocalSeries = {
  id: string;
  title: string;
  metadata?: {
    name?: string;
    overview?: string;
    poster?: string;
    backdrop?: string;
    genres?: string[];
    rating?: number;
    firstAirDate?: string;
    numberOfSeasons?: number;
    cast?: { name: string; character?: string; profile?: string }[];
  } | null;
  episodes: LocalEpisode[];
};

export async function getLocalSeries(): Promise<LocalSeries[]> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE || "";

  const res = await fetch(`${baseUrl}/local-series`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load local series");
  }

  const data = await res.json();
  return data.series || [];
}

export async function getLocalSeriesById(id: string): Promise<LocalSeries | null> {
  const all = await getLocalSeries();
  return all.find((item) => item.id === id) || null;
}