"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, Clapperboard, Play, RefreshCw, Search } from "lucide-react";

import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageMain } from "@/components/page-main";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { type Channel, type VodPlaybackMeta } from "@/lib/channels-data";
import { kanVodService, type KanVodEpisode, type KanVodSeriesDetails } from "@/lib/services/kan-vod-service";

const getSeasonTitle = (seasonId: string, series: KanVodSeriesDetails) => {
  const season = series.seasons.find((item) => item.season_id === seasonId);
  if (season?.title) return season.title;
  return "פרקים";
};

const getEpisodeTitle = (episode: KanVodEpisode) => {
  return episode.episodeName || episode.title || `פרק ${episode.id}`;
};

const getEpisodeImage = (series: KanVodSeriesDetails, episode: KanVodEpisode) => {
  return episode.episodeImage || series.image || "/ch/vod.jpg";
};

const getStreamReferer = (episode: KanVodEpisode) => {
  try {
    const streamUrl = episode.streamUrl || "";
    if (streamUrl) {
      const parsed = new URL(streamUrl);
      return `${parsed.origin}/`;
    }
  } catch {}

  return "https://www.kan.org.il/";
};

const buildVodMeta = (series: KanVodSeriesDetails, episode: KanVodEpisode): VodPlaybackMeta => {
  const seasonTitle = episode.season_id ? getSeasonTitle(episode.season_id, series) : undefined;

  return {
    programName: series.title,
    seasonName: seasonTitle,
    channelName: "כאן VOD",
    episodeName: getEpisodeTitle(episode),
    episodeDescription: episode.episodeOverview || "",
    programDescription: series.description || "",
    programImage: series.image || "",
    channelImage: series.image || "",
    episodeImage: getEpisodeImage(series, episode),
  };
};

const episodeToChannel = (series: KanVodSeriesDetails, episode: KanVodEpisode): Channel => {
  const vodMeta = buildVodMeta(series, episode);
  const image = getEpisodeImage(series, episode);

  return {
    id: episode.id,
    index: 0,
    name: series.title,
    logo: image,
    category: "kan-vod",
    channelID: episode.streamUrl || episode.playUrl || episode.url,
    module: "kan-vod",
    mode: 0,
    linkDetails: {
      link: episode.streamUrl || episode.playUrl || episode.url,
      referer: getStreamReferer(episode),
      manifest_type: "hls",
    },
    type: "vod",
    programs: [],
    tvgID: "",
    url: episode.streamUrl,
    moreData: "",
    playerLogo: image,
    playerTitle: series.title,
    playerSubtitle: [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean).join(" · "),
    vodMeta,
  } as Channel;
};

export default function KanVodDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { currentChannel, play, setCloseHandler } = useFloatingPlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const programId = decodeURIComponent(params.id || "");

  const {
    data: series,
    isLoading,
    error,
    mutate,
  } = useSWR(["kan-vod", programId], () => kanVodService.getSeriesDetails(programId), {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const episodesBySeason = useMemo(() => {
    if (!series) return {} as Record<string, KanVodEpisode[]>;

    return series.episodes.reduce<Record<string, KanVodEpisode[]>>((acc, episode) => {
      const season = episode.season_id || "episodes";
      acc[season] = acc[season] || [];
      acc[season].push(episode);
      return acc;
    }, {});
  }, [series]);

  const seasonEntries = useMemo(() => {
    if (!series) return [] as Array<[string, KanVodEpisode[]]>;

    const seasonOrder = new Map(
      series.seasons.map((season, index) => [season.season_id, season.season_number ?? index])
    );

    return Object.entries(episodesBySeason).sort(([a], [b]) => {
      return (seasonOrder.get(b) ?? -1) - (seasonOrder.get(a) ?? -1);
    });
  }, [episodesBySeason, series]);

  const filteredSeasons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return seasonEntries;

    return seasonEntries
      .map(([season, episodes]) => [
        season,
        episodes.filter((episode) => {
          return (
            getEpisodeTitle(episode).toLowerCase().includes(query) ||
            (episode.episodeOverview || "").toLowerCase().includes(query)
          );
        }),
      ] as [string, KanVodEpisode[]])
      .filter(([, episodes]) => episodes.length > 0);
  }, [seasonEntries, searchQuery]);

  useEffect(() => {
    return () => setCloseHandler(null);
  }, [setCloseHandler]);

  useEffect(() => {
    if (activeSeason && filteredSeasons.some(([season]) => season === activeSeason)) return;
    setActiveSeason(filteredSeasons[0]?.[0] || null);
  }, [activeSeason, filteredSeasons]);

  const playEpisode = useCallback((episode: KanVodEpisode) => {
    if (!series) return;
    play(episodeToChannel(series, episode));
  }, [play, series]);

  const refresh = async () => {
    setIsRefreshing(true);

    try {
      await mutate(() => kanVodService.getSeriesDetails(programId, true), { revalidate: false });
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 250);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
        <PageMain className="px-4 py-5">
          <div className="mb-5 h-44 animate-pulse rounded-lg border border-border bg-card" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        </PageMain>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
        <PageMain className="px-4 py-5">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-base font-medium text-red-500">הסדרה לא נמצאה או שלא ניתן לטעון אותה</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => router.push("/kan-vod")} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                חזרה לכאן VOD
              </button>
              <button onClick={() => mutate()} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                נסה שוב
              </button>
            </div>
          </div>
        </PageMain>
      </div>
    );
  }

  const activeSeasonEpisodes = filteredSeasons.find(([season]) => season === activeSeason)?.[1] || [];
  const playingEpisodeId = currentChannel?.module === "kan-vod" ? currentChannel.id : null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <div className="shrink-0 px-4 pt-4">
        <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
          <div className="relative min-h-48 overflow-hidden">
            {series.image ? (
              <img src={series.image} alt="" className="absolute inset-0 h-full w-full object-cover object-top opacity-25" />
            ) : null}
            <div className="absolute inset-0 bg-linear-to-t from-card via-card/85 to-card/40" />

            <div className="relative z-10 flex flex-col gap-4 p-4 md:flex-row">
              <div className="w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-background md:w-32">
                {series.image ? (
                  <img src={series.image} alt="" className="aspect-[2/3] h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center">
                    <Clapperboard className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/kan-vod")}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <ArrowRight className="h-4 w-4" />
                    חזרה לכאן VOD
                  </button>
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    רענון
                  </button>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => router.push("/vod")}
                    className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    VOD
                  </button>
                  <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
                  <button
                    type="button"
                    onClick={() => router.push("/kan-vod")}
                    className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    כאן VOD
                  </button>
                  <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
                  <span className="rounded bg-secondary px-1 font-medium text-foreground">
                    {series.title}
                  </span>
                </div>

                <h1 className="text-2xl font-bold text-foreground md:text-3xl">{series.title}</h1>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>{series.episodeCount} פרקים</span>
                  {series.seasonCount ? <span>{series.seasonCount} עונות</span> : null}
                  {series.program_genre ? <span>{series.program_genre}</span> : null}
                </div>
                {series.description ? (
                  <p className="mt-3 line-clamp-3 max-w-4xl text-sm leading-6 text-muted-foreground">
                    {series.description}
                  </p>
                ) : null}
              </div>

              <DebouncedSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="חיפוש פרקים"
                className="relative h-10 w-full self-start md:w-80"
              />
            </div>

            {filteredSeasons.length > 0 && (
              <div className="relative z-10 border-t border-border/70 bg-card/80 px-3 py-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="עונות">
                  {filteredSeasons.map(([season, episodes]) => {
                    const isActive = season === activeSeason;
                    return (
                      <button
                        key={season}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveSeason(season)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                          isActive
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {getSeasonTitle(season, series)} · {episodes.length}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PageMain className="px-4">
        <div className="pb-6">
          {filteredSeasons.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו פרקים</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeSeasonEpisodes.map((episode) => {
                const episodeImage = getEpisodeImage(series, episode);
                const episodeTitle = getEpisodeTitle(episode);
                const isPlayingEpisode = episode.id === playingEpisodeId;

                return (
                  <button
                    key={episode.id}
                    type="button"
                    onClick={() => playEpisode(episode)}
                    className={`group flex min-h-[20rem] flex-col overflow-hidden rounded-lg border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary ${
                      isPlayingEpisode ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    aria-current={isPlayingEpisode ? "true" : undefined}
                  >
                    <div className="relative aspect-video overflow-hidden bg-background">
                      {episodeImage ? (
                        <img src={episodeImage} alt="" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Clapperboard className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/15 to-transparent" />
                      <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                        <Play className="h-3.5 w-3.5" />
                        נגן
                      </div>
                      {isPlayingEpisode ? (
                        <div className="absolute left-2 bottom-2 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                          מתנגן
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{episode.published || episode.id}</p>
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
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PageMain>
    </div>
  );
}
