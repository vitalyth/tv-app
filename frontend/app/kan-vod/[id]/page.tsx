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
import { ArrowRight, RefreshCw, Search } from "lucide-react";

import { PageMain } from "@/components/page-main";
import {
  VodEpisodeGrid,
  VodSeriesFloatingHeader,
  VodSeriesHeroCard,
  type VodDetailAction,
  type VodDetailMetaItem,
  type VodEpisodeCardItem,
  type VodSeasonTab,
} from "@/components/vod-series-detail";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { type Channel, type VodItem, type VodPlaybackMeta } from "@/lib/channels-data";
import { kanVodService, type KanVodEpisode, type KanVodSeriesDetails } from "@/lib/services/kan-vod-service";

const VOD_RECENT_KEY = "vod_recently_watched";

type VodNode = {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
};

type RecentVodItem = {
  item: VodItem;
  stack: VodNode[];
  watchedAt: number;
};

const getSeasonTitle = (seasonId: string, series: KanVodSeriesDetails) => {
  const season = series.seasons.find((item) => item.season_id === seasonId);
  if (season?.title) return season.title;
  return "פרקים";
};

const getEpisodeTitle = (episode: KanVodEpisode) => {
  return episode.episodeName || episode.title || `פרק ${episode.id}`;
};

const getEpisodeImage = (series: KanVodSeriesDetails, episode: KanVodEpisode) => {
  return episode.episodeImage || episode.image || series.image || "/ch/vod.jpg";
};

const getEpisodeMetaText = (episode: KanVodEpisode) => {
  return [episode.published, episode.id].filter(Boolean).join(" · ");
};

const getStreamReferer = () => {
  return "https://www.kan.org.il/";
};

const loadRecentVodItems = (): RecentVodItem[] => {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(localStorage.getItem(VOD_RECENT_KEY) || "[]") as RecentVodItem[];
  } catch {
    return [];
  }
};

const episodeToVodItem = (series: KanVodSeriesDetails, episode: KanVodEpisode): VodItem => {
  const image = getEpisodeImage(series, episode);

  return {
    id: episode.id,
    episodeId: episode.id,
    programId: series.id,
    name: getEpisodeTitle(episode),
    title: getEpisodeTitle(episode),
    mode: 0,
    logo: image,
    module: "kan-vod",
    url: episode.streamUrl || episode.playUrl || episode.url,
    streamUrl: episode.streamUrl,
    playUrl: episode.playUrl,
    moreData: "",
    description: episode.episodeOverview || "",
    plot: episode.episodeOverview || "",
    aired: episode.published || "",
    season: episode.season_id ? getSeasonTitle(episode.season_id, series) : "",
    episode: episode.id,
    programName: series.title,
    seasonName: episode.season_id ? getSeasonTitle(episode.season_id, series) : "",
    channelName: "כאן VOD",
    episodeName: getEpisodeTitle(episode),
    episodeDescription: episode.episodeOverview || "",
    programDescription: series.description || "",
    programImage: series.image || "",
    channelImage: series.image || "",
    episodeImage: image,
    isFolder: false,
    isPlayable: true,
  };
};

const episodeToVodStack = (series: KanVodSeriesDetails, episode: KanVodEpisode): VodNode[] => {
  const image = series.image || getEpisodeImage(series, episode);
  const seasonName = episode.season_id ? getSeasonTitle(episode.season_id, series) : "";

  return [
    {
      name: "כאן VOD",
      module: "kan-vod",
      mode: 0,
      url: "/kan-vod",
      logo: image,
      moreData: "",
      description: "",
    },
    {
      name: series.title,
      module: "kan-vod",
      mode: 0,
      url: `/kan-vod/${encodeURIComponent(series.id)}`,
      logo: image,
      moreData: "",
      description: series.description || "",
    },
    ...(seasonName
      ? [{
          name: seasonName,
          module: "kan-vod",
          mode: 0,
          url: `/kan-vod/${encodeURIComponent(series.id)}`,
          logo: image,
          moreData: "",
          description: "",
        }]
      : []),
  ];
};

const saveRecentVodItem = (series: KanVodSeriesDetails, episode: KanVodEpisode) => {
  if (typeof window === "undefined") return;

  try {
    const item = episodeToVodItem(series, episode);
    const stack = episodeToVodStack(series, episode);
    const existing = loadRecentVodItems().filter((saved) => saved.item.id !== item.id);
    const next = [{ item, stack, watchedAt: Date.now() }, ...existing];
    localStorage.setItem(VOD_RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage write errors
  }
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
      referer: getStreamReferer(),
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
    vodProgramId: series.id,
    vodSeasonId: episode.season_id || undefined,
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
  const [showFloatingHeader, setShowFloatingHeader] = useState(false);
  const contentMainRef = useRef<HTMLElement | null>(null);
  const detailsCardRef = useRef<HTMLDivElement | null>(null);
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
            (episode.episodeOverview || "").toLowerCase().includes(query) ||
            (episode.published || "").toLowerCase().includes(query)
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

  useEffect(() => {
    if (
      !series ||
      currentChannel?.module !== "kan-vod" ||
      (currentChannel.vodProgramId && currentChannel.vodProgramId !== programId)
    ) {
      return;
    }

    const playingEpisode = series.episodes.find((episode) => episode.id === currentChannel.id);
    const playingSeason = playingEpisode?.season_id || currentChannel.vodSeasonId;
    if (!playingSeason || !episodesBySeason[playingSeason]) return;

    setSearchQuery("");
    setActiveSeason(playingSeason);
  }, [currentChannel, episodesBySeason, programId, series]);

  const handleBack = () => {
    router.push("/kan-vod");
  };

  const playEpisode = useCallback((episode: KanVodEpisode) => {
    if (!series) return;

    saveRecentVodItem(series, episode);
    play(episodeToChannel(series, episode));
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
  }, [programId, updateFloatingHeader]);

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

  const title = series.title;
  const poster = series.image;
  const backdrop = series.image;
  const tags = [series.program_genre, series.program_format].filter(Boolean);
  const activeSeasonEpisodes = filteredSeasons.find(([season]) => season === activeSeason)?.[1] || [];
  const playingEpisodeId = currentChannel?.module === "kan-vod" ? currentChannel.id : null;
  const metaItems: VodDetailMetaItem[] = [
    { key: "episodes", content: `${series.episodeCount} פרקים` },
    ...(series.seasonCount ? [{ key: "seasons", content: `${series.seasonCount} עונות` }] : []),
    ...(series.streamCount ? [{ key: "streams", content: `${series.streamCount} זמינים` }] : []),
    ...(series.program_genre ? [{ key: "genre", content: series.program_genre }] : []),
  ];
  const seasonTabs: VodSeasonTab[] = filteredSeasons.map(([season, episodes]) => ({
    id: season,
    title: getSeasonTitle(season, series),
    count: episodes.length,
  }));
  const detailActions: VodDetailAction[] = [
    {
      key: "back",
      label: "חזרה לכאן VOD",
      icon: <ArrowRight className="h-4 w-4" />,
      onClick: handleBack,
    },
    {
      key: "refresh",
      label: "רענון",
      icon: <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />,
      onClick: refresh,
      disabled: isRefreshing,
      title: "רענון",
      iconOnlyInFloating: true,
    },
  ];
  const episodeCards: VodEpisodeCardItem[] = activeSeasonEpisodes.map((episode) => ({
    id: episode.id,
    image: getEpisodeImage(series, episode),
    title: getEpisodeTitle(episode),
    meta: getEpisodeMetaText(episode),
    description: episode.episodeOverview,
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
            tags={tags as string[]}
            description={series.description}
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
