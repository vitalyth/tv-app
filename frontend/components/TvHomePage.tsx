"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Clapperboard, History, Play, RadioTower, Tv } from "lucide-react";

import { channelService } from "@/lib/services/channel-service";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { Channel, VodChannel, VodItem, VodPlaybackMeta } from "@/lib/channels-data";

type TvFocusable = HTMLButtonElement | HTMLAnchorElement;

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

const fetchLiveChannels = async (): Promise<Channel[]> => {
  return await channelService.getLiveChannels();
};

const fetchVodChannels = async (): Promise<VodChannel[]> => {
  return await channelService.getVodChannels();
};

const fetchVodRecent = async (): Promise<VodItem[]> => {
  return await channelService.getVodRecent();
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
  const seasonName = explicitSeason && explicitSeason !== programNode?.name
    ? explicitSeason
    : undefined;

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
    linkDetails: { link: item.url },
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

const loadRecentVodItems = (): RecentVodItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const items = JSON.parse(localStorage.getItem(VOD_RECENT_KEY) || "[]") as RecentVodItem[];
    return items.sort((a, b) => b.watchedAt - a.watchedAt);
  } catch {
    return [];
  }
};

const saveRecentVodItem = (item: VodItem, stack: VodNode[]) => {
  if (typeof window === "undefined") return;

  try {
    const stored = loadRecentVodItems().filter((saved) => saved.item.id !== item.id);
    localStorage.setItem(
      VOD_RECENT_KEY,
      JSON.stringify([{ item, stack, watchedAt: Date.now() }, ...stored])
    );
  } catch {
    // Ignore local browser storage failures.
  }
};

const vodRecentStack = (item: VodItem): VodNode[] => [
  {
    name: item.channelName || item.programName || item.name,
    module: item.module,
    mode: item.mode,
    url: item.url,
    logo: item.channelImage || item.logo,
    moreData: item.moreData,
    description: item.description,
  },
];

const getFocusableItems = (root: HTMLElement | null): TvFocusable[] => {
  if (!root) return [];

  return Array.from(
    root.querySelectorAll<TvFocusable>("button:not([disabled]), a[href]")
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
};

const focusItem = (items: TvFocusable[], index: number) => {
  const next = items[index];
  if (!next) return;

  next.focus();
  next.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
};

export default function TvHomePage() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { play } = useFloatingPlayer();
  const [recentVodItems, setRecentVodItems] = useState<RecentVodItem[]>([]);

  const {
    data: liveChannels = [],
    isLoading: isLiveLoading,
    error: liveError,
  } = useSWR("tv-live-channels", fetchLiveChannels, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const {
    data: vodChannels = [],
    isLoading: isVodLoading,
    error: vodError,
  } = useSWR("tv-vod-channels", fetchVodChannels, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const {
    data: vodRecentItems = [],
    isLoading: isVodRecentLoading,
    error: vodRecentError,
  } = useSWR("tv-vod-recent", fetchVodRecent, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 60000,
  });

  const isLoading = isLiveLoading || isVodLoading || isVodRecentLoading;
  const hasError = Boolean(liveError || vodError || vodRecentError);

  useEffect(() => {
    document.body.classList.add("tv-mode");

    return () => {
      document.body.classList.remove("tv-mode");
    };
  }, []);

  useEffect(() => {
    setRecentVodItems(loadRecentVodItems());
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const timer = window.setTimeout(() => {
      const items = getFocusableItems(rootRef.current);
      focusItem(items, 0);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const moveFocus = useCallback((direction: "left" | "right" | "up" | "down") => {
    const items = getFocusableItems(rootRef.current);
    if (!items.length) return;

    const activeElement = document.activeElement as TvFocusable | null;
    const currentIndex = Math.max(0, items.findIndex((item) => item === activeElement));
    const current = items[currentIndex] || items[0];
    const currentRect = current.getBoundingClientRect();

    let candidates = items
      .map((item, index) => ({ item, index, rect: item.getBoundingClientRect() }))
      .filter(({ index }) => index !== currentIndex)
      .filter(({ rect }) => {
        if (direction === "right") return rect.left > currentRect.left + 24;
        if (direction === "left") return rect.right < currentRect.right - 24;
        if (direction === "down") return rect.top > currentRect.top + 24;
        return rect.bottom < currentRect.bottom - 24;
      });

    candidates = candidates.sort((a, b) => {
      const aHorizontal = Math.abs(a.rect.left - currentRect.left);
      const bHorizontal = Math.abs(b.rect.left - currentRect.left);
      const aVertical = Math.abs(a.rect.top - currentRect.top);
      const bVertical = Math.abs(b.rect.top - currentRect.top);

      if (direction === "left" || direction === "right") {
        return aVertical - bVertical || aHorizontal - bHorizontal;
      }

      return aHorizontal - bHorizontal || aVertical - bVertical;
    });

    const nextIndex = candidates[0]?.index;
    if (typeof nextIndex !== "number") return;

    focusItem(items, nextIndex);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFocus("left");
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFocus("right");
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus("up");
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus("down");
      }

      if (event.key === "Enter" || event.key === " ") {
        if (document.activeElement instanceof HTMLElement) {
          event.preventDefault();
          document.activeElement.click();
        }
      }
    },
    [moveFocus]
  );

  const playLive = useCallback(
    (channel: Channel) => {
      play(channel, { fullscreen: true });
    },
    [play]
  );

  const playVod = useCallback(
    (item: VodItem, stack: VodNode[]) => {
      saveRecentVodItem(item, stack);
      setRecentVodItems(loadRecentVodItems());
      play(itemToChannel(item, stack), { fullscreen: true });
    },
    [play]
  );

  const openVodChannel = useCallback(
    (channel: VodChannel) => {
      const path = [
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
        path: JSON.stringify(path),
      });

      router.push(`/tv/vod?${params.toString()}`);
    },
    [router]
  );

  return (
    <div
      ref={rootRef}
      dir="rtl"
      onKeyDown={handleKeyDown}
      className="tv-stage h-screen w-screen overflow-hidden text-foreground"
    >
      <style jsx global>{`
        body.tv-mode .site-header,
        body.tv-mode footer,
        body.tv-mode .site-footer {
          display: none !important;
        }

        body.tv-mode {
          overflow: hidden;
        }
      `}</style>

      <main className="flex h-full flex-col px-12 py-9">
        <div className="tv-panel mb-9 shrink-0 overflow-hidden rounded-[2rem] px-8 py-7">
          <div className="flex items-center justify-between gap-8">
            <div className="flex min-w-0 items-center gap-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.75rem] bg-primary shadow-[0_18px_42px_rgba(20,211,217,0.22)]">
                <Tv className="h-11 w-11 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-primary">Best TV</p>
                <h1 className="truncate text-6xl font-bold tracking-tight">TV App</h1>
              </div>
            </div>
            <div className="max-w-xl border-r border-border/80 pr-8 text-left">
              <p className="text-2xl font-medium text-foreground">שידורים חיים ו-VOD למסך הגדול</p>
              <p className="mt-2 text-lg text-muted-foreground">המשך ישיר לערוצים, ספריות ופרקים אחרונים.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="min-h-0 flex-1 space-y-10 overflow-hidden">
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <section key={rowIndex} className="space-y-5">
                <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
                <div className="flex gap-6 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-52 w-80 shrink-0 animate-pulse rounded-3xl border border-border bg-card"
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : hasError ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-3xl border border-border bg-card p-10 text-2xl text-destructive">
              שגיאה בטעינת התוכן
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-12 styled-scrollbar">
            {liveChannels.length > 0 && (
              <TvSection
                title="ערוצים"
                description="כל הערוצים החיים במקום אחד"
              >
                <TvRail itemClassName="w-72 xl:w-80">
                  {liveChannels.map((channel) => (
                    <LiveChannelCard
                      key={channel.id}
                      channel={channel}
                      onPlay={() => playLive(channel)}
                    />
                  ))}
                </TvRail>
              </TvSection>
            )}

            {vodChannels.length > 0 && (
              <TvSection title="VOD" description="ספריות לצפייה לפי ערוץ">
                <TvRail itemClassName="w-[25rem] xl:w-[28rem]">
                  {vodChannels.map((channel) => (
                    <VodLibraryCard
                      key={channel.id}
                      channel={channel}
                      onOpen={() => openVodChannel(channel)}
                    />
                  ))}
                </TvRail>
              </TvSection>
            )}

            {vodRecentItems.length > 0 && (
              <TvSection title="חדש ב-VOD" description="פרקים ותוכניות שנוספו לאחרונה">
                <TvRail itemClassName="w-[27rem] xl:w-[30rem]">
                  {vodRecentItems.map((item) => {
                    const stack = vodRecentStack(item);

                    return (
                      <VodEpisodeCard
                        key={item.id}
                        item={item}
                        stack={stack}
                        action="חדש"
                        onPlay={() => playVod(item, stack)}
                      />
                    );
                  })}
                </TvRail>
              </TvSection>
            )}

            {recentVodItems.length > 0 && (
              <TvSection title="נצפו לאחרונה" description="חזרה מהירה למה שהתחלת לראות">
                <TvRail itemClassName="w-[27rem] xl:w-[30rem]">
                  {recentVodItems.map(({ item, stack }) => (
                    <VodEpisodeCard
                      key={item.id}
                      item={item}
                      stack={stack}
                      action="המשך"
                      onPlay={() => playVod(item, stack)}
                    />
                  ))}
                </TvRail>
              </TvSection>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TvSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-14 space-y-6">
      <div className="flex items-end gap-5">
        <span className="mb-2 h-11 w-1.5 shrink-0 rounded-full bg-primary" />
        <div>
          <h2 className="text-4xl font-bold">{title}</h2>
          {description && <p className="mt-2 text-xl text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function TvRail({
  children,
  itemClassName,
}: {
  children: ReactNode;
  itemClassName: string;
}) {
  const items = Array.isArray(children) ? children : [children];

  return (
    <div className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-2 pb-6 pt-2 scroll-smooth scrollbar-hide">
      {items.map((child, index) => (
        <div key={index} className={`${itemClassName} shrink-0 snap-start *:h-full *:w-full`}>
          {child}
        </div>
      ))}
    </div>
  );
}

function LiveChannelCard({
  channel,
  onPlay,
}: {
  channel: Channel;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tv-focus-card group flex h-72 flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card/95 p-6 text-right transition hover:border-primary/60 hover:bg-secondary"
    >
      <div className="flex h-36 w-full items-center justify-center rounded-3xl border border-border bg-background/75">
        <img
          src={`/ch/${channel.logo}`}
          alt={channel.name}
          className="h-28 w-28 object-contain p-2 transition-transform group-focus:scale-110"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-primary">
          <RadioTower className="h-5 w-5" />
          <span className="text-lg font-bold">LIVE</span>
        </div>
        <h3 className="mt-2 truncate text-3xl font-bold">{channel.name}</h3>
      </div>
    </button>
  );
}

function VodLibraryCard({
  channel,
  onOpen,
}: {
  channel: VodChannel;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tv-focus-card group flex h-72 items-center gap-6 overflow-hidden rounded-3xl border border-border bg-card/95 p-6 text-right transition hover:border-primary/60 hover:bg-secondary"
    >
      <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-border bg-background">
        <img
          src={getVodImageSrc(channel.logo)}
          alt={channel.name}
          className="h-full w-full object-contain p-4 transition-transform group-focus:scale-110"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-primary">
          <Clapperboard className="h-5 w-5" />
          <span className="text-lg font-bold">VOD</span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-3xl font-bold">{channel.name}</h3>
        <p className="mt-2 truncate text-xl text-muted-foreground">{channel.module}</p>
      </div>
    </button>
  );
}

function VodEpisodeCard({
  item,
  stack,
  action,
  onPlay,
}: {
  item: VodItem;
  stack: VodNode[];
  action: string;
  onPlay: () => void;
}) {
  const meta = buildVodMeta(item, stack);
  const title = meta.episodeName || item.title || item.name;
  const subtitle = [
    meta.channelName,
    meta.programName !== title ? meta.programName : null,
    meta.seasonName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onPlay}
      className="tv-focus-card group flex h-[22rem] flex-col overflow-hidden rounded-3xl border border-border bg-card/95 text-right transition hover:border-primary/60 hover:bg-secondary"
    >
      <div className="relative h-44 shrink-0 overflow-hidden bg-background">
        <img
          src={getVodImageSrc(meta.episodeImage || meta.programImage || item.logo)}
          alt=""
          className="h-full w-full object-cover object-top transition-transform group-focus:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-transparent" />
        <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-base font-bold text-white">
          {action === "המשך" ? <History className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          {action}
        </span>
      </div>
      <div className="min-w-0 flex-1 p-6">
        {subtitle && <p className="truncate text-lg text-muted-foreground">{subtitle}</p>}
        <h3 className="mt-2 line-clamp-2 text-3xl font-bold leading-tight">{title}</h3>
      </div>
    </button>
  );
}
