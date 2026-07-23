"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { channelService } from "@/lib/services/channel-service";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { usePlayer } from "@/context/player-context";
import {
  Channel,
  Program,
  VodChannel,
  VodItem,
  VodPlaybackMeta,
  getKanVodEpisodeId,
  getKanVodProgramId,
} from "@/lib/channels-data";
import { ChannelCard } from "@/components/channel-card";
import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  ContinueWatchingVodCarousel,
  NewVodCarousel,
} from "@/components/vod-content-carousels";
import { getDetailImageSrc, getGridImageSrc, resolveImageSrc } from "@/lib/image-urls";
import { ChevronLeft, Clapperboard, Play, RotateCcw } from "lucide-react";

const VOD_RECENT_KEY = "vod_recently_watched";
const VOD_PATH_PARAM = "path";
const QUICK_LIVE_CHANNEL_KEYS = ["11", "12", "13", "14", "i24news"];
const LIVE_NOW_LIMIT = 12;
const RECENT_LIVE_LIMIT = 12;

type EpgProgram = {
  start: number;
  end: number;
  title?: string;
  name?: string;
  description?: string;
};

type VodNode = {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
};

interface RecentVodItem {
  item: VodItem;
  stack: VodNode[];
  watchedAt: number;
}

const loadRecentVodItems = (): RecentVodItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(VOD_RECENT_KEY);
    if (!stored) return [];

    const items = JSON.parse(stored) as RecentVodItem[];
    return items.sort((a, b) => b.watchedAt - a.watchedAt);
  } catch {
    return [];
  }
};

const saveRecentVodItem = (item: VodItem, stack: VodNode[]) => {
  if (typeof window === "undefined") return;

  try {
    const stored = loadRecentVodItems().filter((saved) => saved.item.id !== item.id);
    const next = [{ item, stack, watchedAt: Date.now() }, ...stored];
    localStorage.setItem(VOD_RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore write errors
  }
};

const getVodImageSrc = (logo: string) => {
  return resolveImageSrc(logo) || "/ch/vod.jpg";
};

const isVodGroupingNode = (name?: string) => {
  const normalized = (name || "").trim();
  return [
    "כל התוכניות",
    "כל התכניות",
    "תוכניות",
    "תכניות",
    "סדרות",
    "פרקים",
    "VOD",
  ].includes(normalized);
};

const isSeasonNode = (name?: string) => {
  const normalized = (name || "").trim();
  return /^עונה\b/.test(normalized) || /^Season\b/i.test(normalized);
};

const isKanVodChannel = (channel: VodChannel) => {
  const name = channel.name.trim();
  return channel.id === "kan" || name === "כאן 11";
};

const isKeshetVodChannel = (channel: VodChannel) => {
  const name = channel.name.trim();
  return channel.id === "vod_keshet12" || name === "קשת 12";
};

const isReshetVodChannel = (channel: VodChannel) => {
  const name = channel.name.trim();
  return channel.id === "vod_reshet13" || name === "רשת 13";
};

const buildVodMeta = (item: VodItem, stack: VodNode[]): VodPlaybackMeta => {
  const channelNode = stack[0];
  const contentNodes = stack.slice(1).filter((node) => !isVodGroupingNode(node.name));
  const seasonNode = [...contentNodes].reverse().find((node) => isSeasonNode(node.name));
  const programNode =
    contentNodes.find((node) => !isSeasonNode(node.name)) ||
    stack.find((node, index) => index > 0 && !isVodGroupingNode(node.name)) ||
    stack[1] ||
    stack[0];
  const explicitSeason = item.seasonName || item.season || seasonNode?.name;
  const seasonName = explicitSeason && explicitSeason !== programNode?.name ? explicitSeason : undefined;

  return {
    programName: item.programName || programNode?.name || item.name,
    seasonName,
    channelName: item.channelName || channelNode?.name || "VOD",
    episodeName: item.episodeName || item.title || item.name,
    episodeDescription: item.episodeDescription || item.description || item.plot,
    programDescription: item.programDescription || programNode?.description,
    programImage: item.programImage || programNode?.logo || item.logo,
    channelImage: item.channelImage || channelNode?.logo || item.logo,
    episodeImage: item.episodeImage || item.logo,
  };
};

const itemToChannel = (item: VodItem, stack: VodNode[]): Channel => {
  const vodMeta = buildVodMeta(item, stack);
  const titleParts = [vodMeta.channelName, vodMeta.programName].filter(Boolean);
  const subtitleParts = [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean);
  const stackUrls = stack.map((node) => node.url);

  return {
    id: getKanVodEpisodeId(item.module, item.episodeId, item.id),
    index: 0,
    name: vodMeta.channelName,
    logo: vodMeta.channelImage || item.logo,
    category: "vod",
    channelID: item.url,
    module: item.module,
    mode: item.mode,
    linkDetails: {
      link: item.url,
    },
    type: "vod",
    programs: [],
    tvgID: "",
    url: item.url,
    moreData: item.moreData,
    playerLogo: vodMeta.channelImage || item.logo,
    playerTitle: titleParts.join(" · "),
    playerSubtitle: subtitleParts.join(" · "),
    vodProgramId: getKanVodProgramId(item.module, item.programId, stackUrls),
    vodMeta,
  };
};

const fetchLiveChannels = async (): Promise<Channel[]> => {
  return await channelService.getLiveChannels();
};

const fetchEpg = async (): Promise<Record<string, EpgProgram[]>> => {
  return await channelService.getEpg();
};

const fetchVodChannels = async (): Promise<VodChannel[]> => {
  return await channelService.getVodChannels();
};

const fetchVodRecent = async (): Promise<VodItem[]> => {
  return await channelService.getVodRecent();
};

const normalizeProgram = (program: Program | EpgProgram): Program => ({
  start: program.start,
  end: program.end,
  name: ("name" in program ? program.name : program.title) || "שידור חי",
  description: program.description || "",
});

const getCurrentProgram = (channel: Channel) => {
  const now = Math.floor(Date.now() / 1000);
  return channel.programs?.find((program) => program.start <= now && now < program.end);
};

const getProgramProgress = (program?: Program) => {
  if (!program || program.end <= program.start) return 0;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, Math.min(100, ((now - program.start) / (program.end - program.start)) * 100));
};

const carouselCompactCardClass =
  "w-[72vw] max-w-[17rem] shrink-0 sm:w-[15rem] lg:w-[16rem]";

const LandingPage = () => {
  const router = useRouter();
  const { play } = usePlayer();
  const [recentVodItems, setRecentVodItems] = useState<RecentVodItem[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);

  const {
    data: liveChannels = [],
    isLoading: isLiveLoading,
    error: liveError,
  } = useSWR("landing-live-channels", fetchLiveChannels, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const {
    data: epg = {},
    isLoading: isEpgLoading,
    error: epgError,
  } = useSWR("landing-epg", fetchEpg, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const {
    data: vodChannels = [],
    isLoading: isVodLoading,
    error: vodError,
  } = useSWR("landing-vod-channels", fetchVodChannels, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const {
    data: vodRecentItems = [],
    isLoading: isVodRecentLoading,
    error: vodRecentError,
  } = useSWR("landing-vod-recent", fetchVodRecent, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 60000,
  });

  const { recentlyViewed, addToRecentlyViewed } = useRecentlyViewed(liveChannels);

  useEffect(() => {
    setRecentVodItems(loadRecentVodItems());
  }, []);

  const liveNowChannels = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    const recentlyViewedRank = new Map(
      recentlyViewed.map((channel, index) => [channel.id, index])
    );

    return liveChannels
      .map((channel) => {
        const programs = (
          (channel.tvgID ? epg[channel.tvgID] : undefined) ?? channel.programs ?? []
        ).map(normalizeProgram);
        const currentProgram = programs.find((prog) => prog.start <= now && now < prog.end);

        return currentProgram ? { ...channel, programs } : null;
      })
      .filter((channel): channel is Channel => Boolean(channel))
      .filter((channel) => {
        const key = channel.tvgID || channel.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aRank = recentlyViewedRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bRank = recentlyViewedRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      })
      .slice(0, LIVE_NOW_LIMIT);
  }, [liveChannels, epg, recentlyViewed]);

  const quickLiveChannels = useMemo(() => {
    const order = new Map(QUICK_LIVE_CHANNEL_KEYS.map((id, index) => [id, index]));
    const seen = new Set<string>();

    return liveChannels
      .map((channel) => {
        const key = order.has(channel.id) ? channel.id : channel.tvgID;
        return key && order.has(key) ? { channel, key } : null;
      })
      .filter((item): item is { channel: Channel; key: string } => Boolean(item))
      .filter((channel) => {
        if (seen.has(channel.key)) return false;
        seen.add(channel.key);
        return true;
      })
      .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
      .map(({ channel }) => channel);
  }, [liveChannels]);

  const recommendedVodChannels = useMemo(() => vodChannels.slice(0, 20), [vodChannels]);
  const recentlyAddedVodItems = useMemo(
    () => vodRecentItems,
    [vodRecentItems]
  );
  const recentlyAddedCarouselItems = useMemo(
    () => recentlyAddedVodItems.map((item) => ({
      item,
      stack: [{
        name: item.channelName || item.title || item.name,
        module: item.module,
        mode: item.mode,
        url: item.url,
        logo: item.logo,
        moreData: item.moreData,
        description: item.description,
      }],
    })),
    [recentlyAddedVodItems],
  );
  const heroItems = useMemo(() => recentlyAddedVodItems.slice(0, 5), [recentlyAddedVodItems]);

  useEffect(() => {
    setHeroIndex(0);
    if (heroItems.length <= 1) return;

    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroItems.length);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [heroItems.length]);

  const isLoading = isLiveLoading || isEpgLoading || isVodLoading || isVodRecentLoading;
  const hasLiveError = Boolean(liveError || epgError);
  const hasVodError = Boolean(vodError || vodRecentError);
  const hasAnyContent =
    recentVodItems.length > 0 ||
    recentlyViewed.length > 0 ||
    liveNowChannels.length > 0 ||
    recommendedVodChannels.length > 0 ||
    recentlyAddedVodItems.length > 0;

  const handlePlayLiveChannel = useCallback(
    (channel: Channel) => {
      addToRecentlyViewed(channel);
      play(channel);
    },
    [addToRecentlyViewed, play]
  );

  const handlePlayVodItem = useCallback(
    (item: VodItem, stack: VodNode[]) => {
      const channel = itemToChannel(item, stack);
      saveRecentVodItem(item, stack);
      setRecentVodItems(loadRecentVodItems());
      play(channel);
    },
    [play]
  );

  const handleContinueVodItem = useCallback(
    (item: VodItem, stack: VodNode[]) => {
      handlePlayVodItem(item, stack);

      const programId = getKanVodProgramId(
        item.module,
        item.programId,
        stack.map((node) => node.url),
      );

      if (item.module === "kan-vod" && programId) {
        router.push(`/kan-vod/${encodeURIComponent(programId)}`);
        return;
      }

      if (item.module === "keshet-vod" && programId) {
        router.push(`/keshet-vod/${encodeURIComponent(programId)}`);
        return;
      }

      if (item.module === "reshet-vod" && programId) {
        router.push(`/reshet-vod/${encodeURIComponent(programId)}`);
        return;
      }

      if (stack.length > 0) {
        const params = new URLSearchParams({
          [VOD_PATH_PARAM]: JSON.stringify(stack),
        });
        router.push(`/vod?${params.toString()}`);
      }
    },
    [handlePlayVodItem, router]
  );

  const handleBrowseVod = useCallback(() => {
    router.push("/vod");
  }, [router]);

  const handleOpenVodChannel = useCallback(
    (channel: VodChannel) => {
      if (isKanVodChannel(channel)) {
        router.push("/kan-vod");
        return;
      }

      if (isKeshetVodChannel(channel)) {
        router.push("/keshet-vod");
        return;
      }

      if (isReshetVodChannel(channel)) {
        router.push("/reshet-vod");
        return;
      }

      const path: VodNode[] = [
        {
          name: channel.name,
          module: channel.module,
          mode: channel.mode,
          url: channel.url,
          logo: channel.logo,
          moreData: "",
          description: "",
        },
      ];
      const params = new URLSearchParams({
        [VOD_PATH_PARAM]: JSON.stringify(path),
      });

      router.push(`/vod?${params.toString()}`);
    },
    [router]
  );

  const handleOpenGuide = useCallback(() => {
    router.push("/guide");
  }, [router]);

  const SectionHeader = ({
    title,
    subtitle,
    action,
  }: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
  }) => (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const VodCard = ({ channel, onClick }: { channel: VodChannel; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-28 w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
        <img
          src={getGridImageSrc(getVodImageSrc(channel.logo))}
          alt=""
          className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{channel.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{channel.module}</p>
        </div>
        <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
      </div>
    </button>
  );

  const LiveNowCard = ({ channel }: { channel: Channel }) => {
    const program = getCurrentProgram(channel);
    const progress = getProgramProgress(program);

    return (
      <button
        type="button"
        onClick={() => handlePlayLiveChannel(channel)}
        className="group flex h-full min-h-40 w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="flex flex-1 items-start gap-4 p-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-2">
            <img src={`/ch/${channel.logo}`} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                LIVE
              </span>
              <span className="truncate text-xs text-muted-foreground">{channel.name}</span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">
              {program?.name || "שידור חי"}
            </h3>
            {program && (
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(program.start * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                {" - "}
                {new Date(program.end * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              </p>
            )}
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-red-500" style={{ width: `${progress}%` }} />
        </div>
      </button>
    );
  };

  const heroItem = heroItems[heroIndex];
  const heroStack: VodNode[] = heroItem
    ? [{
        name: heroItem.channelName || heroItem.title || heroItem.name,
        module: heroItem.module,
        mode: heroItem.mode,
        url: heroItem.url,
        logo: heroItem.logo,
        moreData: heroItem.moreData,
        description: heroItem.description,
      }]
    : [];
  const heroVodMeta = heroItem ? buildVodMeta(heroItem, heroStack) : null;
  const heroImage = heroVodMeta
    ? getDetailImageSrc(heroVodMeta.episodeImage || heroVodMeta.programImage || heroItem?.logo || "") || "/ch/vod.jpg"
    : "/ch/vod.jpg";
  const getHeroSlideOffset = (index: number) => {
    if (heroItems.length <= 1) return 0;

    let offset = index - heroIndex;
    const halfway = heroItems.length / 2;

    if (offset > halfway) offset -= heroItems.length;
    if (offset < -halfway) offset += heroItems.length;

    return offset;
  };
  const heroTitle = heroVodMeta?.programName || heroItem?.name || "תוכן ישראלי במקום אחד";
  const heroSubtitle = heroVodMeta
    ? [heroVodMeta.channelName, heroVodMeta.seasonName, heroVodMeta.episodeName].filter(Boolean).join(" · ")
    : "שידורים חיים, VOD וסדרות";
  const handleHeroPlay = () => {
    if (heroItem) {
      handleContinueVodItem(heroItem, heroStack);
    } else {
      handleBrowseVod();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" dir="rtl">
      <PageMain>
        <section className="relative min-h-64 overflow-hidden border-b border-border md:min-h-80">
          {heroItems.length > 0 ? (
            heroItems.map((item, index) => {
              const slideOffset = getHeroSlideOffset(index);
              const itemStack: VodNode[] = [{
                name: item.channelName || item.title || item.name,
                module: item.module,
                mode: item.mode,
                url: item.url,
                logo: item.logo,
                moreData: item.moreData,
                description: item.description,
              }];
              const itemMeta = buildVodMeta(item, itemStack);
              const image = getDetailImageSrc(
                itemMeta.episodeImage || itemMeta.programImage || item.logo,
              ) || "/ch/vod.jpg";

              return (
                <img
                  key={item.id}
                  src={image}
                  alt=""
                  aria-hidden={index !== heroIndex}
                  className="absolute -top-[44%] h-[152%] w-full object-cover object-top transition-[transform,opacity] duration-700 ease-in-out"
                  style={{
                    opacity: Math.abs(slideOffset) <= 1 ? 1 : 0,
                    transform: `translateX(${slideOffset * 100}%)`,
                  }}
                />
              );
            })
          ) : (
            <img
              src={heroImage}
              alt=""
              className="absolute -top-[44%] h-[152%] w-full object-cover object-top"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.72)_12%,rgba(0,0,0,0.04)_32%,rgba(0,0,0,0.04)_68%,rgba(0,0,0,0.78)_88%,rgba(0,0,0,1)_100%)]" />
          <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-black/20" />
          <div className="relative flex min-h-64 max-w-3xl flex-col justify-end px-4 py-6 text-white md:min-h-80 md:px-8 md:py-8">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <span className="rounded bg-white/15 px-2 py-1 backdrop-blur-sm">
                {heroItem ? "חדש ב-VOD" : "TV App"}
              </span>
            </div>
            <h1 className="line-clamp-2 text-2xl font-bold sm:text-3xl lg:text-4xl">{heroTitle}</h1>
            <p className="mt-2 line-clamp-2 max-w-xl text-sm text-white/75 sm:text-base">{heroSubtitle}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={handleHeroPlay} className="gap-2 bg-white text-black hover:bg-white/90">
                <Play className="h-4 w-4 fill-current" />
                צפה עכשיו
              </Button>
              <Button variant="outline" onClick={handleBrowseVod} className="border-white/35 bg-black/25 text-white hover:bg-white/15 hover:text-white">
                לכל התכנים
              </Button>
            </div>

            {heroItems.length > 1 && (
              <div className="mt-5 flex items-center gap-2" aria-label="בחירת תוכן בבאנר">
                {heroItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHeroIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${index === heroIndex ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/70"}`}
                    aria-label={`הצג פריט ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {quickLiveChannels.length > 0 && (
            <div className="absolute left-1 top-1 z-10 flex max-w-[calc(100%-0.5rem)] items-center gap-2 overflow-x-auto p-2 scrollbar-hide md:left-2 md:top-2">
              {quickLiveChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  aria-label={`פתח ${channel.name}`}
                  onClick={() => handlePlayLiveChannel(channel)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/35 transition hover:border-white/70 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white sm:h-12 sm:w-12"
                >
                  <img
                    src={`/ch/${channel.logo}`}
                    alt={channel.name}
                    className="h-8 w-8 rounded-full object-contain sm:h-9 sm:w-9"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="flex-1 px-3 pb-8 pt-5 md:px-6 lg:px-8">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : (
          <div className="space-y-8">
            <ContinueWatchingVodCarousel
              items={recentVodItems}
              buildMeta={buildVodMeta}
              getImageSrc={getVodImageSrc}
              onPlay={handleContinueVodItem}
              action={
                <Button variant="outline" size="sm" onClick={handleBrowseVod} className="shrink-0 gap-2">
                  <RotateCcw className="h-4 w-4" />
                  עוד VOD
                </Button>
              }
            />

            {liveNowChannels.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="משודר עכשיו"
                  action={
                    <Button variant="outline" size="sm" onClick={handleOpenGuide} className="shrink-0">
                      כל השידורים
                    </Button>
                  }
                />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {liveNowChannels.map((channel) => (
                    <LiveNowCard key={channel.id} channel={channel} />
                  ))}
                </HorizontalCarousel>
              </section>
            )}

            {recentlyViewed.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="הערוצים שלי"
                />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {recentlyViewed.slice(0, RECENT_LIVE_LIMIT).map((channel) => (
                    <ChannelCard
                      key={channel.id}
                      channel={channel}
                      isActive={false}
                      onClick={() => handlePlayLiveChannel(channel)}
                    />
                  ))}
                </HorizontalCarousel>
              </section>
            )}

            <NewVodCarousel
              items={recentlyAddedCarouselItems}
              buildMeta={buildVodMeta}
              getImageSrc={getVodImageSrc}
              onPlay={handleContinueVodItem}
            />

            {recommendedVodChannels.length > 0 && (
              <section className="space-y-4">
                <SectionHeader title="ספריות VOD" />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {recommendedVodChannels.map((channel) => (
                    <VodCard key={channel.id} channel={channel} onClick={() => handleOpenVodChannel(channel)} />
                  ))}
                </HorizontalCarousel>
              </section>
            )}

            {!hasAnyContent && !hasVodError && !hasLiveError && (
              <section className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
                <Clapperboard className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                <p className="text-base font-medium text-foreground">אין תוכן להצגה כרגע</p>
                <p className="mt-1 text-sm text-muted-foreground">נסה להיכנס ל-VOD או למדריך השידורים.</p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button onClick={handleBrowseVod}>VOD</Button>
                  <Button variant="outline" onClick={handleOpenGuide}>מדריך</Button>
                </div>
              </section>
            )}

            {(hasVodError || hasLiveError) && (
              <section className="rounded-lg border border-border bg-card p-6 text-right text-sm text-destructive">
                <p>שגיאה בטעינת תוכן. אנא רענן את הדף.</p>
              </section>
            )}
          </div>
        )}
        </div>
      </PageMain>
    </div>
  );
};

export default LandingPage;
