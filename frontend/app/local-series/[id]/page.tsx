"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, Clapperboard, Play, Search, Star } from "lucide-react";

import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { type Channel, type VodPlaybackMeta } from "@/lib/channels-data";
import { localSeriesService, type LocalEpisode, type LocalSeries } from "@/lib/services/local-series-service";

const LOCAL_SERIES_RECENT_KEY = "local_series_recently_watched";

type LocalRecentItem = {
  seriesId: string;
  episodeId: string;
  watchedAt: number;
};

const getSeriesTitle = (series: LocalSeries) => {
  return series.metadata?.name || series.title || "ללא שם";
};

const getSeriesImage = (series: LocalSeries) => {
  return series.metadata?.poster || series.metadata?.backdrop || "/ch/vod.jpg";
};

const getSeasonTitle = (season: string) => {
  return season === "0" ? "פרקים" : `עונה ${season}`;
};

const getEpisodeLabel = (episode: LocalEpisode) => {
  const season = episode.season ? `S${String(episode.season).padStart(2, "0")}` : "";
  const ep = episode.episode ? `E${String(episode.episode).padStart(2, "0")}` : "";
  const code = `${season}${ep}`;
  return code || episode.filename;
};

const getEpisodeTitle = (episode: LocalEpisode) => {
  return episode.episodeName || (episode.episode ? `פרק ${episode.episode}` : episode.filename);
};

const getEpisodeImage = (series: LocalSeries, episode: LocalEpisode) => {
  return episode.episodeImage || series.metadata?.backdrop || series.metadata?.poster || "";
};

const getEpisodeMetaText = (episode: LocalEpisode) => {
  return [
    getEpisodeLabel(episode),
    episode.airDate,
    episode.runtime ? `${episode.runtime} דק׳` : null,
  ].filter(Boolean).join(" · ");
};

const loadRecentItems = (): LocalRecentItem[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SERIES_RECENT_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveRecentItem = (seriesId: string, episodeId: string) => {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecentItems().filter((item) => item.episodeId !== episodeId);
    const next = [{ seriesId, episodeId, watchedAt: Date.now() }, ...existing].slice(0, 30);
    localStorage.setItem(LOCAL_SERIES_RECENT_KEY, JSON.stringify(next));
  } catch {}
};

const buildVodMeta = (series: LocalSeries, episode: LocalEpisode): VodPlaybackMeta => {
  const title = getSeriesTitle(series);
  const image = getEpisodeImage(series, episode) || getSeriesImage(series);
  const episodeTitle = getEpisodeTitle(episode);

  return {
    programName: title,
    seasonName: episode.season ? `Season ${episode.season}` : undefined,
    channelName: "Local Series",
    episodeName: episodeTitle,
    episodeDescription: episode.episodeOverview || series.metadata?.overview || "",
    programDescription: series.metadata?.overview || "",
    programImage: getSeriesImage(series),
    channelImage: getSeriesImage(series),
    episodeImage: image,
  };
};

const episodeToChannel = (series: LocalSeries, episode: LocalEpisode): Channel => {
  const title = getSeriesTitle(series);
  const vodMeta = buildVodMeta(series, episode);
  const image = getSeriesImage(series);

  return {
    id: episode.id,
    index: 0,
    name: title,
    logo: image,
    category: "local-series",
    channelID: episode.streamUrl,
    module: "local-series",
    mode: 0,
    linkDetails: {
      link: episode.streamUrl,
      streamUrl: episode.streamUrl,
      direct: true,
      manifest_type: "mp4",
    },
    type: "vod",
    programs: [],
    tvgID: "",
    url: episode.streamUrl,
    moreData: "",
    playerLogo: image,
    playerTitle: title,
    playerSubtitle: [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean).join(" · "),
    vodMeta,
  } as Channel;
};

export default function LocalSeriesDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { play, setCloseHandler } = useFloatingPlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeason, setActiveSeason] = useState<string | null>(null);

  const seriesId = decodeURIComponent(params.id || "");

  const {
    data: allSeries = [],
    isLoading,
    error,
    mutate,
  } = useSWR("local-series", () => localSeriesService.getSeriesList(), {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const series = useMemo(() => {
    return allSeries.find((item) => item.id === seriesId) || null;
  }, [allSeries, seriesId]);

  const episodesBySeason = useMemo(() => {
    if (!series) return {} as Record<string, LocalEpisode[]>;

    return series.episodes.reduce<Record<string, LocalEpisode[]>>((acc, episode) => {
      const season = String(episode.season || 0);
      acc[season] = acc[season] || [];
      acc[season].push(episode);
      return acc;
    }, {});
  }, [series]);

  const seasonEntries = useMemo(() => {
    return Object.entries(episodesBySeason).sort(([a], [b]) => Number(a) - Number(b));
  }, [episodesBySeason]);

  const filteredSeasons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return seasonEntries;

    return seasonEntries
      .map(([season, episodes]) => [
        season,
        episodes.filter((episode) => {
          return (
            episode.filename.toLowerCase().includes(query) ||
            getEpisodeLabel(episode).toLowerCase().includes(query) ||
            (episode.episodeName || "").toLowerCase().includes(query) ||
            (episode.episodeOverview || "").toLowerCase().includes(query)
          );
        }),
      ] as [string, LocalEpisode[]])
      .filter(([, episodes]) => episodes.length > 0);
  }, [seasonEntries, searchQuery]);

  useEffect(() => {
    return () => setCloseHandler(null);
  }, [setCloseHandler]);

  useEffect(() => {
    if (activeSeason && filteredSeasons.some(([season]) => season === activeSeason)) return;
    setActiveSeason(filteredSeasons[0]?.[0] || null);
  }, [activeSeason, filteredSeasons]);

  const handleBack = () => {
    router.push("/local-series");
  };

  const playEpisode = useCallback((episode: LocalEpisode) => {
    if (!series) return;

    const channel = episodeToChannel(series, episode);
    saveRecentItem(series.id, episode.id);
    play(channel);
  }, [play, series]);

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
        <main className="flex-1 min-h-0 flex flex-col px-4 py-5 max-w-7xl mx-auto w-full overflow-hidden">
          <div className="mb-5 h-40 shrink-0 animate-pulse rounded-lg border border-border bg-card" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
        <main className="flex-1 min-h-0 flex flex-col px-4 py-5 max-w-7xl mx-auto w-full overflow-hidden">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-base font-medium text-red-500">הסדרה לא נמצאה או שלא ניתן לטעון אותה</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={handleBack} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                חזרה לסדרות
              </button>
              <button onClick={() => mutate()} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                נסה שוב
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const title = getSeriesTitle(series);
  const poster = series.metadata?.poster;
  const backdrop = series.metadata?.backdrop || series.metadata?.poster;
  const genres = series.metadata?.genres || [];
  const activeSeasonEpisodes = filteredSeasons.find(([season]) => season === activeSeason)?.[1] || [];

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <main className="flex-1 min-h-0 flex flex-col px-4 py-5 max-w-7xl mx-auto w-full overflow-hidden">
        <div className="mb-5 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="relative min-h-64 overflow-hidden">
            {backdrop ? (
              <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
            ) : null}
            <div className="absolute inset-0 bg-linear-to-t from-card via-card/80 to-card/30" />

            <div className="relative z-10 flex flex-col gap-5 p-5 md:flex-row md:items-end">
              <div className="hidden w-36 shrink-0 overflow-hidden rounded-lg border border-border bg-background md:block">
                {poster ? (
                  <img src={poster} alt="" className="aspect-[2/3] h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center">
                    <Clapperboard className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <ArrowRight className="h-4 w-4" />
                  חזרה לסדרות
                </button>

                <h1 className="text-3xl font-bold text-foreground md:text-4xl">{title}</h1>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {series.metadata?.firstAirDate ? <span>{series.metadata.firstAirDate}</span> : null}
                  {series.metadata?.rating ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-current text-primary" />
                      {series.metadata.rating.toFixed(1)}
                    </span>
                  ) : null}
                  <span>{series.episodes.length} פרקים</span>
                </div>

                {genres.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {genres.map((genre) => (
                      <span key={genre} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {series.metadata?.overview && (
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                    {series.metadata.overview}
                  </p>
                )}
              </div>

              <div className="relative w-full md:w-80">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="חיפוש פרקים"
                  className="w-full rounded-lg border border-border bg-background/80 py-2.5 pr-9 pl-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6 styled-scrollbar">
          {filteredSeasons.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו פרקים</p>
              <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" role="tablist" aria-label="עונות">
                {filteredSeasons.map(([season, episodes]) => {
                  const isActive = season === activeSeason;
                  return (
                    <button
                      key={season}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveSeason(season)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {getSeasonTitle(season)} · {episodes.length}
                    </button>
                  );
                })}
              </div>

              <section className="space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-foreground">
                      {activeSeason ? getSeasonTitle(activeSeason) : "פרקים"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{activeSeasonEpisodes.length} פרקים</p>
                  </div>
                </div>

                <HorizontalCarousel itemClassName="w-[82vw] max-w-[22rem] shrink-0 sm:w-[20rem] lg:w-[21rem]">
                  {activeSeasonEpisodes.map((episode) => {
                    const episodeImage = getEpisodeImage(series, episode);
                    const episodeTitle = getEpisodeTitle(episode);
                    const episodeMeta = getEpisodeMetaText(episode);

                    return (
                      <button
                        key={episode.id}
                        type="button"
                        onClick={() => playEpisode(episode)}
                        className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div className="relative aspect-video overflow-hidden bg-background">
                          {episodeImage ? (
                            <img
                              src={episodeImage}
                              alt=""
                              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <Clapperboard className="h-10 w-10 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
                          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                            <Play className="h-3.5 w-3.5" />
                            נגן
                          </div>
                          {episode.runtime ? (
                            <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                              {episode.runtime} דק׳
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">{episodeMeta}</p>
                              <h3 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">
                                {episodeTitle}
                              </h3>
                            </div>
                            <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                          </div>

                          {episode.episodeOverview ? (
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                              {episode.episodeOverview}
                            </p>
                          ) : (
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {episode.filename}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {episode.screenSize ? <span className="rounded-full bg-muted px-2 py-1">{episode.screenSize}</span> : null}
                            {episode.source ? <span className="rounded-full bg-muted px-2 py-1">{episode.source}</span> : null}
                            {episode.videoCodec ? <span className="rounded-full bg-muted px-2 py-1">{episode.videoCodec}</span> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </HorizontalCarousel>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
