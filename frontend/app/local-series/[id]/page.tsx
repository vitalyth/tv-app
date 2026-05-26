"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, Clapperboard, Play, Search, Star } from "lucide-react";

import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { PageMain } from "@/components/page-main";
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
  const { currentChannel, play, setCloseHandler } = useFloatingPlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [contentViewportHeight, setContentViewportHeight] = useState(0);
  const headerShellRef = useRef<HTMLDivElement | null>(null);
  const contentMainRef = useRef<HTMLElement | null>(null);
  const expandedHeaderHeightRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);

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
    const updateViewportHeight = () => {
      setIsShortViewport(window.innerHeight < 620);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (isShortViewport) {
      setIsHeaderCompact(true);
    }
  }, [isShortViewport]);

  useEffect(() => {
    const header = headerShellRef.current;
    if (!header) return;

    const saveExpandedHeight = () => {
      if (isHeaderCompact) return;
      expandedHeaderHeightRef.current = header.getBoundingClientRect().height;
    };

    saveExpandedHeight();

    const resizeObserver = new ResizeObserver(saveExpandedHeight);
    resizeObserver.observe(header);

    return () => resizeObserver.disconnect();
  }, [isHeaderCompact, seriesId]);

  useEffect(() => {
    const content = contentMainRef.current;
    if (!content) return;

    const updateContentHeight = () => {
      const nextHeight = Math.round(content.getBoundingClientRect().height);
      setContentViewportHeight((currentHeight) => (
        Math.abs(currentHeight - nextHeight) > 4 ? nextHeight : currentHeight
      ));
    };

    updateContentHeight();

    const resizeObserver = new ResizeObserver(updateContentHeight);
    resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (activeSeason && filteredSeasons.some(([season]) => season === activeSeason)) return;
    setActiveSeason(filteredSeasons[0]?.[0] || null);
  }, [activeSeason, filteredSeasons]);

  const handleBack = () => {
    router.push("/local-series");
  };

  const expandHeaderIfThereIsRoom = useCallback(
    (scroller: HTMLElement) => {
      if (isShortViewport || scroller.scrollTop > 1) return;

      const header = headerShellRef.current;
      const expandedHeaderHeight = expandedHeaderHeightRef.current;
      const currentHeaderHeight = header?.getBoundingClientRect().height ?? expandedHeaderHeight;
      const scrollHeightAfterExpand = scroller.clientHeight + currentHeaderHeight - expandedHeaderHeight;
      const minimumComfortableScrollHeight = Math.min(360, Math.max(260, window.innerHeight * 0.42));

      if (scrollHeightAfterExpand >= minimumComfortableScrollHeight) {
        setIsHeaderCompact((current) => (current ? false : current));
      }
    },
    [isShortViewport]
  );

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      const scroller = event.currentTarget;
      const scrollTop = scroller.scrollTop;
      const lastScrollTop = lastScrollTopRef.current;
      const isScrollingDown = scrollTop > lastScrollTop;
      lastScrollTopRef.current = scrollTop;

      if (isShortViewport || (isScrollingDown && scrollTop > 32)) {
        setIsHeaderCompact((current) => (current ? current : true));
      }
    },
    [isShortViewport]
  );

  const handleContentWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (event.deltaY < 0) {
        expandHeaderIfThereIsRoom(event.currentTarget);
      }
    },
    [expandHeaderIfThereIsRoom]
  );

  const handleContentTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleContentTouchMove = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;

      if (currentY - startY > 20) {
        expandHeaderIfThereIsRoom(event.currentTarget);
      }
    },
    [expandHeaderIfThereIsRoom]
  );

  const playEpisode = useCallback((episode: LocalEpisode) => {
    if (!series) return;

    const channel = episodeToChannel(series, episode);
    saveRecentItem(series.id, episode.id);
    play(channel);
  }, [play, series]);

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
        <PageMain className="px-4 py-5">
          <div className="mb-5 h-40 shrink-0 animate-pulse rounded-lg border border-border bg-card" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
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
              <button onClick={handleBack} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                חזרה לסדרות
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

  const title = getSeriesTitle(series);
  const poster = series.metadata?.poster;
  const backdrop = series.metadata?.backdrop || series.metadata?.poster;
  const genres = series.metadata?.genres || [];
  const cast = series.metadata?.cast || [];
  const activeSeasonEpisodes = filteredSeasons.find(([season]) => season === activeSeason)?.[1] || [];
  const playingEpisodeId = currentChannel?.module === "local-series" ? currentChannel.id : null;
  const episodeCardDensity =
    isShortViewport || (contentViewportHeight > 0 && contentViewportHeight < 300)
      ? "tiny"
      : contentViewportHeight > 0 && contentViewportHeight < 420
        ? "compact"
        : "regular";
  const episodeCarouselItemClass =
    episodeCardDensity === "tiny"
      ? "w-[42vw] max-w-[9rem] shrink-0 sm:w-[15rem] sm:max-w-[17rem] lg:w-[21rem]"
      : episodeCardDensity === "compact"
        ? "w-[48vw] max-w-[10.5rem] shrink-0 sm:w-[16rem] sm:max-w-[18rem] lg:w-[21rem]"
        : "w-[56vw] max-w-[12.5rem] shrink-0 sm:w-[18rem] sm:max-w-[20rem] lg:w-[21rem]";
  const episodeCardClass =
    episodeCardDensity === "tiny"
      ? "group relative flex h-[6.75rem] overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:h-[14rem] lg:h-[22rem]"
      : episodeCardDensity === "compact"
        ? "group relative flex h-[8rem] overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:h-[17rem] lg:h-[22rem]"
        : "group flex h-full min-h-[12.25rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:min-h-[20rem] lg:min-h-[22rem]";
  const useEpisodeOverlayCard = episodeCardDensity !== "regular";

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <div ref={headerShellRef} className="shrink-0 px-2 pt-1.5 sm:px-4 sm:pt-3">
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-card transition-[height] duration-300 sm:mb-3">
          <div
            className={`relative overflow-hidden transition-[min-height] duration-300 ${
              isHeaderCompact ? "min-h-[4.5rem] sm:min-h-28" : "min-h-[8rem] sm:min-h-44"
            }`}
          >
            {backdrop ? (
              <img
                src={backdrop}
                alt=""
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  isHeaderCompact ? "opacity-20" : "opacity-35"
                }`}
              />
            ) : null}
            <div className="absolute inset-0 bg-linear-to-t from-card via-card/80 to-card/30" />

            <div
              className={`relative z-10 flex gap-3 transition-[padding] duration-300 md:flex-row md:items-start ${
                isHeaderCompact ? "flex-row items-center p-2 sm:p-3" : "flex-col p-2.5 sm:p-4"
              }`}
            >
              <div
                className={`shrink-0 overflow-hidden rounded-lg border border-border bg-background transition-[width] duration-300 ${
                  isHeaderCompact ? "w-10 sm:w-16" : "w-16 sm:w-24 md:w-28"
                }`}
              >
                {poster ? (
                  <img src={poster} alt="" className="aspect-[2/3] h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center">
                    <Clapperboard className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className={`mb-1.5 inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary ${
                    isHeaderCompact ? "hidden sm:inline-flex" : ""
                  }`}
                >
                  <ArrowRight className="h-4 w-4" />
                  חזרה לסדרות
                </button>

                <h1
                  className={`font-bold text-foreground transition-all duration-300 ${
                    isHeaderCompact ? "line-clamp-1 text-base sm:text-xl" : "text-lg sm:text-2xl md:text-3xl"
                  }`}
                >
                  {title}
                </h1>

                <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:mt-1.5 sm:gap-2 sm:text-sm ${isHeaderCompact ? "line-clamp-1" : ""}`}>
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
                  <div className={`mt-1 flex flex-wrap gap-1 sm:mt-2 sm:gap-1.5 ${isHeaderCompact ? "hidden" : ""}`}>
                    {genres.map((genre) => (
                      <span key={genre} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:px-2 sm:py-1 sm:text-xs">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {cast.length > 0 && !isHeaderCompact && (
                  <div className="mt-2 hidden sm:block">
                    <p className="mb-1 text-xs font-medium text-foreground">שחקנים</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {cast.slice(0, 8).map((person) => (
                        <div key={person.id || person.name} className="w-14 shrink-0 text-center sm:w-16">
                          <div className="mx-auto h-10 w-10 overflow-hidden rounded-full border border-border bg-muted">
                            {person.profile ? (
                              <img src={person.profile} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                {person.name?.slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-foreground">{person.name}</p>
                          {person.character ? (
                            <p className="line-clamp-1 text-[10px] text-muted-foreground">{person.character}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {series.metadata?.overview && !isHeaderCompact && (
                  <p className="mt-1 line-clamp-1 max-w-3xl text-[11px] leading-4 text-muted-foreground sm:mt-1.5 sm:line-clamp-2 sm:text-xs sm:leading-5">
                    {series.metadata.overview}
                  </p>
                )}
              </div>

              <div className={`relative w-full transition-opacity duration-300 md:w-80 ${isHeaderCompact ? "hidden md:block" : ""}`}>
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="חיפוש פרקים"
                  className="w-full rounded-lg border border-border bg-background/80 py-1.5 pr-9 pl-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:py-2"
                />
              </div>
            </div>

            {filteredSeasons.length > 0 && (
              <div className="relative z-10 border-t border-border/70 bg-card/80 px-1.5 py-1.5 sm:px-3 sm:py-2">
                <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide sm:gap-1.5 sm:pb-1" role="tablist" aria-label="עונות">
                  {filteredSeasons.map(([season, episodes]) => {
                    const isActive = season === activeSeason;
                    return (
                      <button
                        key={season}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveSeason(season)}
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-primary sm:px-3 sm:py-1.5 sm:text-xs ${
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
              </div>
            )}
          </div>
        </div>

      </div>

      <PageMain
        ref={contentMainRef}
        className="px-3 sm:px-4"
        onScroll={handleContentScroll}
        onWheel={handleContentWheel}
        onTouchStart={handleContentTouchStart}
        onTouchMove={handleContentTouchMove}
      >
        <div className="pb-6">
          {filteredSeasons.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו פרקים</p>
              <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר.</p>
            </div>
          ) : (
            <div>
              <section>
                <HorizontalCarousel itemClassName={episodeCarouselItemClass}>
                  {activeSeasonEpisodes.map((episode) => {
                    const episodeImage = getEpisodeImage(series, episode);
                    const episodeTitle = getEpisodeTitle(episode);
                    const episodeMeta = getEpisodeMetaText(episode);
                    const isPlayingEpisode = episode.id === playingEpisodeId;

                    return (
                      <button
                        key={episode.id}
                        type="button"
                        onClick={() => playEpisode(episode)}
                        className={`${episodeCardClass} ${
                          isPlayingEpisode
                            ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)),0_0_22px_rgba(45,212,191,0.22)]"
                            : ""
                        }`}
                        aria-current={isPlayingEpisode ? "true" : undefined}
                      >
                        <div className={useEpisodeOverlayCard ? "absolute inset-0 overflow-hidden bg-background" : "relative aspect-video overflow-hidden bg-background"}>
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
                          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/15 to-transparent" />
                          <div className={useEpisodeOverlayCard ? "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] text-white" : "absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white"}>
                            <Play className="h-3.5 w-3.5" />
                            נגן
                          </div>
                          {episode.runtime ? (
                            <div className={useEpisodeOverlayCard ? "absolute left-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] text-white" : "absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-xs text-white"}>
                              {episode.runtime} דק׳
                            </div>
                          ) : null}
                          {isPlayingEpisode && (
                            <div className="absolute left-2 bottom-2 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-md">
                              מתנגן
                            </div>
                          )}
                        </div>

                        {useEpisodeOverlayCard ? (
                          <div className="absolute inset-x-0 bottom-0 z-10 min-w-0 bg-linear-to-t from-black/85 via-black/55 to-transparent p-2 pt-8 text-white">
                            <p className="line-clamp-1 text-[10px] text-white/75">{episodeMeta}</p>
                            <h3 className="mt-0.5 line-clamp-1 text-xs font-semibold">
                              {episodeTitle}
                            </h3>
                            {(episode.episodeOverview || episode.filename) && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-white/80">
                                {episode.episodeOverview || episode.filename}
                              </p>
                            )}
                          </div>
                        ) : (
                        <div className="min-w-0 p-2.5 sm:p-4">
                          <div className="flex items-start justify-between gap-2 sm:gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">{episodeMeta}</p>
                              <h3 className="mt-0.5 line-clamp-2 text-xs font-semibold text-foreground sm:mt-1 sm:text-base">
                                {episodeTitle}
                              </h3>
                            </div>
                            <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                          </div>

                          {episode.episodeOverview ? (
                            <p className="mt-1.5 line-clamp-1 text-xs leading-5 text-muted-foreground sm:mt-2 sm:line-clamp-3 sm:text-sm sm:leading-6">
                              {episode.episodeOverview}
                            </p>
                          ) : (
                            <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground sm:mt-2 sm:line-clamp-2">
                              {episode.filename}
                            </p>
                          )}

                          <div className="mt-3 hidden flex-wrap gap-1.5 text-xs text-muted-foreground sm:flex">
                            {episode.screenSize ? <span className="rounded-full bg-muted px-2 py-1">{episode.screenSize}</span> : null}
                            {episode.source ? <span className="rounded-full bg-muted px-2 py-1">{episode.source}</span> : null}
                            {episode.videoCodec ? <span className="rounded-full bg-muted px-2 py-1">{episode.videoCodec}</span> : null}
                          </div>
                        </div>
                        )}
                      </button>
                    );
                  })}
                </HorizontalCarousel>
              </section>
            </div>
          )}
        </div>
      </PageMain>
    </div>
  );
}
