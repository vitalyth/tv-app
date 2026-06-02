"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { channelService } from "@/lib/services/channel-service";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { Channel, Program, VodChannel, VodItem, VodPlaybackMeta } from "@/lib/channels-data";
import { ChannelCard } from "@/components/channel-card";
import { HorizontalCarousel } from "@/components/horizontal-carousel";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { getVodProgressPercent } from "@/lib/vod-progress";
import { ChevronLeft, Clapperboard, Play, RotateCcw, Tv } from "lucide-react";

const VOD_RECENT_KEY = "vod_recently_watched";
const VOD_PATH_PARAM = "path";
const QUICK_LIVE_CHANNEL_TVG_IDS = ["11", "12", "13", "14", "i24news"];

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
  if (!logo) return "/ch/vod.jpg";
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  return `/ch/${logo}`;
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

  return {
    id: item.id,
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

const carouselCompactCardClass =
  "w-[72vw] max-w-[17rem] shrink-0 sm:w-[15rem] lg:w-[16rem]";

const LandingPage = () => {
  const router = useRouter();
  const { play } = useFloatingPlayer();
  const [recentVodItems, setRecentVodItems] = useState<RecentVodItem[]>([]);

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
      .slice(0, 6);
  }, [liveChannels, epg, recentlyViewed]);

  const quickLiveChannels = useMemo(() => {
    const order = new Map(QUICK_LIVE_CHANNEL_TVG_IDS.map((id, index) => [id, index]));
    const seen = new Set<string>();

    return liveChannels
      .filter((channel) => channel.tvgID && order.has(channel.tvgID))
      .filter((channel) => {
        if (seen.has(channel.tvgID!)) return false;
        seen.add(channel.tvgID!);
        return true;
      })
      .sort((a, b) => (order.get(a.tvgID!) ?? 0) - (order.get(b.tvgID!) ?? 0));
  }, [liveChannels]);

  const recommendedVodChannels = useMemo(() => vodChannels.slice(0, 20), [vodChannels]);
  const recentlyAddedVodItems = useMemo(
    () => vodRecentItems,
    [vodRecentItems]
  );

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

  const handleBrowseVod = useCallback(() => {
    router.push("/vod");
  }, [router]);

  const handleOpenVodChannel = useCallback(
    (channel: VodChannel) => {
      if (isKanVodChannel(channel)) {
        router.push("/kan-vod");
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
          src={getVodImageSrc(channel.logo)}
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

  const VodItemCard = ({
    item,
    stack,
    label,
  }: {
    item: VodItem;
    stack: VodNode[];
    label: string;
  }) => {
    const meta = buildVodMeta(item, stack);
    const title = meta.episodeName || item.name;
    const subtitle = [meta.channelName, meta.programName !== title ? meta.programName : null, meta.seasonName]
      .filter(Boolean)
      .join(" · ");
    const progressPercent = label === "המשך" ? getVodProgressPercent(item.id) : 0;

    return (
      <button
        type="button"
        onClick={() => handlePlayVodItem(item, stack)}
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="relative aspect-video overflow-hidden bg-background">
          <img
            src={getVodImageSrc(meta.episodeImage || meta.programImage || item.logo)}
            alt=""
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
            <Play className="h-3.5 w-3.5 fill-current" />
            {label}
          </span>
          {progressPercent > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true">
              <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
        <div className="min-w-0 p-4">
          {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
          <h3 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">{title}</h3>
          {meta.episodeDescription && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {meta.episodeDescription}
            </p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" dir="rtl">
      <section className="mb-3 shrink-0 border-b border-border bg-background px-3 pb-2 pt-3 md:px-6 md:pt-5 lg:px-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="hidden min-w-0 lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                <Tv className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold text-foreground">ברוכים הבאים</h1>
                <p className="text-sm text-muted-foreground">
                  המשך צפייה, VOD ושידורים חיים במקום אחד.
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-hide lg:overflow-visible lg:pb-0">
            {quickLiveChannels.map((channel) => (
              <button
                key={channel.tvgID}
                type="button"
                aria-label={`פתח ${channel.name}`}
                onClick={() => handlePlayLiveChannel(channel)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted transition hover:border-primary/70 hover:bg-primary/10 sm:h-11 sm:w-11 lg:h-14 lg:w-14"
              >
                <img
                  src={`/ch/${channel.logo}`}
                  alt={channel.name}
                  className="h-7 w-7 rounded-full object-contain sm:h-8 sm:w-8 lg:h-10 lg:w-10"
                />
              </button>
            ))}
          </div>
        </div>
      </section>

      <PageMain>
        <div className="flex-1 px-3 pb-6 md:px-6 lg:px-8">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : (
          <div className="space-y-8">
            {recommendedVodChannels.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="VOD"
                  subtitle="כניסה לתוכן ספריות VOD"
                />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {recommendedVodChannels.map((channel) => (
                    <VodCard
                      key={channel.id}
                      channel={channel}
                      onClick={() => handleOpenVodChannel(channel)}
                    />
                  ))}
                </HorizontalCarousel>
              </section>
            )}

            {recentVodItems.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="המשך צפייה ב-VOD"
                  subtitle="חזרה מהירה לפרקים ולתוכניות האחרונות"
                  action={
                    <Button variant="outline" size="sm" onClick={handleBrowseVod} className="shrink-0 gap-2">
                      <RotateCcw className="h-4 w-4" />
                      עוד VOD
                    </Button>
                  }
                />

                <HorizontalCarousel>
                  {recentVodItems.map(({ item, stack }) => (
                    <VodItemCard key={item.id} item={item} stack={stack} label="המשך" />
                  ))}
                </HorizontalCarousel>
              </section>
            )}

            {recentlyAddedVodItems.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="חדש ב-VOD"
                  subtitle="תכנים שנוספו לאחרונה"
                />
                <HorizontalCarousel>
                  {recentlyAddedVodItems.map((item) => {
                    const itemStack: VodNode[] = [
                      {
                        name: item.channelName || item.title || item.name,
                        module: item.module,
                        mode: item.mode,
                        url: item.url,
                        logo: item.logo,
                        moreData: item.moreData,
                        description: item.description,
                      },
                    ];
                    return (
                      <VodItemCard key={item.id} item={item} stack={itemStack} label="נגן" />
                    );
                  })}
                </HorizontalCarousel>
              </section>
            )}

            {recentlyViewed.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="Live נצפו לאחרונה"
                  subtitle="השידורים שחזרת אליהם לאחרונה"
                />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {recentlyViewed.slice(0, 6).map((channel) => (
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

            {liveNowChannels.length > 0 && (
              <section className="space-y-4">
                <SectionHeader
                  title="משודר עכשיו"
                  subtitle="שידורים חיים פעילים כרגע"
                  action={
                    <Button variant="outline" size="sm" onClick={handleOpenGuide} className="shrink-0">
                      כל השידורים
                    </Button>
                  }
                />
                <HorizontalCarousel itemClassName={carouselCompactCardClass}>
                  {liveNowChannels.map((channel) => (
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
