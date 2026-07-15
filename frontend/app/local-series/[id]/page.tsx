"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, Search, Star } from "lucide-react";

import { PageMain } from "@/components/page-main";
import {
  VodEpisodeGrid,
  VodSeriesFloatingHeader,
  VodSeriesHeroCard,
  type VodCastMember,
  type VodDetailAction,
  type VodDetailMetaItem,
  type VodEpisodeCardItem,
  type VodSeasonTab,
} from "@/components/vod-series-detail";
import { usePlayer } from "@/context/player-context";
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
  const { currentChannel, play, setCloseHandler } = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [showFloatingHeader, setShowFloatingHeader] = useState(false);
  const contentMainRef = useRef<HTMLElement | null>(null);
  const detailsCardRef = useRef<HTMLDivElement | null>(null);

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

  const updateFloatingHeader = useCallback(() => {
    const scroller = contentMainRef.current;
    const detailsCard = detailsCardRef.current;
    if (!scroller || !detailsCard) return;

    const scrollerTop = scroller.getBoundingClientRect().top;
    const detailsBottom = detailsCard.getBoundingClientRect().bottom - scrollerTop;
    setShowFloatingHeader(detailsBottom <= 180);
  }, []);

  useEffect(() => {
    setShowFloatingHeader(false);
    updateFloatingHeader();
  }, [seriesId, updateFloatingHeader]);

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
  const cast: VodCastMember[] = (series.metadata?.cast || [])
    .filter((person) => Boolean(person.name))
    .map((person) => ({
      id: String(person.id || person.name),
      name: person.name as string,
      character: person.character,
      profile: person.profile,
    }));
  const activeSeasonEpisodes = filteredSeasons.find(([season]) => season === activeSeason)?.[1] || [];
  const playingEpisodeId = currentChannel?.module === "local-series" ? currentChannel.id : null;
  const metaItems: VodDetailMetaItem[] = [
    ...(series.metadata?.firstAirDate ? [{ key: "first-air-date", content: series.metadata.firstAirDate }] : []),
    ...(series.metadata?.rating ? [{
      key: "rating",
      content: (
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-current text-primary" />
          {series.metadata.rating.toFixed(1)}
        </span>
      ),
    }] : []),
    { key: "episodes", content: `${series.episodes.length} פרקים` },
  ];
  const seasonTabs: VodSeasonTab[] = filteredSeasons.map(([season, episodes]) => ({
    id: season,
    title: getSeasonTitle(season),
    count: episodes.length,
  }));
  const detailActions: VodDetailAction[] = [{
    key: "back",
    label: "חזרה לסדרות",
    icon: <ArrowRight className="h-4 w-4" />,
    onClick: handleBack,
  }];
  const episodeCards: VodEpisodeCardItem[] = activeSeasonEpisodes.map((episode) => ({
    id: episode.id,
    image: getEpisodeImage(series, episode),
    title: getEpisodeTitle(episode),
    meta: getEpisodeMetaText(episode),
    description: episode.episodeOverview,
    fallbackText: episode.filename,
    runtime: episode.runtime ? `${episode.runtime} דק׳` : null,
    badges: [episode.screenSize, episode.source, episode.videoCodec].filter(Boolean) as string[],
    isPlaying: episode.id === playingEpisodeId,
  }));

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <VodSeriesFloatingHeader
        show={showFloatingHeader}
        title={title}
        poster={poster}
        backdrop={backdrop}
        metaItems={metaItems}
        actions={detailActions}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        seasons={seasonTabs}
        activeSeason={activeSeason}
        onSeasonChange={setActiveSeason}
      />

      <PageMain
        ref={contentMainRef}
        className="px-3 sm:px-4"
        onScroll={updateFloatingHeader}
      >
        <div className="pt-3">
          <VodSeriesHeroCard
            cardRef={detailsCardRef}
            hidden={showFloatingHeader}
            title={title}
            poster={poster}
            backdrop={backdrop}
            metaItems={metaItems}
            tags={genres}
            cast={cast}
            description={series.metadata?.overview}
            actions={detailActions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            seasons={seasonTabs}
            activeSeason={activeSeason}
            onSeasonChange={setActiveSeason}
          />
        </div>

        <div className="pb-6 pt-1">
          {filteredSeasons.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו פרקים</p>
              <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר.</p>
            </div>
          ) : (
            <VodEpisodeGrid
              episodes={episodeCards}
              onPlay={(episode) => {
                const sourceEpisode = activeSeasonEpisodes.find((item) => item.id === episode.id);
                if (sourceEpisode) playEpisode(sourceEpisode);
              }}
            />
          )}
        </div>
      </PageMain>
    </div>
  );
}
