"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowRight,
  ChevronLeft,
  Clapperboard,
  FolderOpen,
  Play,
  Tv,
} from "lucide-react";

import { useFloatingPlayer } from "@/context/floating-player-context";
import { Channel, VodChannel, VodItem, VodPlaybackMeta } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";

type TvFocusable = HTMLButtonElement | HTMLAnchorElement;

type VodNode = {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
  description?: string;
};

const VOD_PATH_PARAM = "path";
const VOD_RECENT_KEY = "vod_recently_watched";

const getImageSrc = (logo: string) => {
  if (!logo) return "/ch/vod.jpg";
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  return `/ch/${logo}`;
};

const toVodNode = (channel: VodChannel): VodNode => ({
  name: channel.name,
  module: channel.module,
  mode: channel.mode,
  url: channel.url,
  logo: channel.logo,
  moreData: "",
  description: "",
});

const itemToVodNode = (item: VodItem): VodNode => ({
  name: item.name,
  module: item.module,
  mode: item.mode,
  url: item.url,
  logo: item.logo,
  moreData: item.moreData,
  description: item.description,
});

const parsePath = (value: string | null): VodNode[] => {
  if (!value) return [];

  try {
    const stack = JSON.parse(value) as VodNode[];
    return Array.isArray(stack) ? stack : [];
  } catch {
    return [];
  }
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
  const seasonName =
    explicitSeason && explicitSeason !== programNode?.name ? explicitSeason : undefined;

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
    playerTitle: [vodMeta.channelName, vodMeta.programName].filter(Boolean).join(" · "),
    playerSubtitle: [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean).join(" · "),
    vodMeta,
  };
};

const loadRecentItems = () => {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(localStorage.getItem(VOD_RECENT_KEY) || "[]") as {
      item: VodItem;
      stack: VodNode[];
      watchedAt: number;
    }[];
  } catch {
    return [];
  }
};

const saveRecentItem = (item: VodItem, stack: VodNode[]) => {
  if (typeof window === "undefined") return;

  try {
    const stored = loadRecentItems().filter((recent) => recent.item.id !== item.id);
    localStorage.setItem(
      VOD_RECENT_KEY,
      JSON.stringify([{ item, stack, watchedAt: Date.now() }, ...stored])
    );
  } catch {
    // Keep playback working when browser storage is unavailable.
  }
};

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
  next.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
};

export default function TvVodPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { play } = useFloatingPlayer();
  const [navigationStack, setNavigationStack] = useState<VodNode[]>([]);

  const currentNode = navigationStack.at(-1) || null;
  const {
    data: channels = [],
    isLoading: isChannelsLoading,
    error: channelsError,
  } = useSWR("tv-vod-browser-channels", () => channelService.getVodChannels() as Promise<VodChannel[]>, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const {
    data: items = [],
    isLoading: isItemsLoading,
    error: itemsError,
    mutate: retryItems,
  } = useSWR(
    currentNode
      ? [
          "tv-vod-browser-items",
          currentNode.module,
          currentNode.mode,
          currentNode.url,
          currentNode.name,
          currentNode.logo,
          currentNode.moreData,
        ]
      : null,
    async ([, module, mode, url, name, iconimage, moreData]) =>
      channelService.getVodItems({
        module,
        mode,
        url,
        name,
        iconimage,
        moreData,
      }) as Promise<VodItem[]>,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const isLoading = currentNode ? isItemsLoading : isChannelsLoading;
  const error = currentNode ? itemsError : channelsError;
  const title = currentNode?.name || "VOD";
  const description = currentNode
    ? "בחר תוכנית, עונה או פרק לצפייה"
    : "ספריות VOD מותאמות לצפייה מהספה";

  const shownNodes = useMemo(() => navigationStack.slice(-3), [navigationStack]);

  useEffect(() => {
    document.body.classList.add("tv-mode");

    return () => {
      document.body.classList.remove("tv-mode");
    };
  }, []);

  const updatePath = useCallback((stack: VodNode[]) => {
    if (typeof window === "undefined") return;

    const nextUrl = new URL(window.location.href);
    if (stack.length) {
      nextUrl.searchParams.set(VOD_PATH_PARAM, JSON.stringify(stack));
    } else {
      nextUrl.searchParams.delete(VOD_PATH_PARAM);
    }

    window.history.pushState(null, "", nextUrl);
  }, []);

  const syncFromUrl = useCallback(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setNavigationStack(parsePath(params.get(VOD_PATH_PARAM)));
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);

    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [syncFromUrl]);

  useEffect(() => {
    if (isLoading) return;

    const timer = window.setTimeout(() => {
      focusItem(getFocusableItems(rootRef.current), 0);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [currentNode?.url, isLoading, items.length, channels.length]);

  const moveFocus = useCallback((direction: "left" | "right" | "up" | "down") => {
    const focusable = getFocusableItems(rootRef.current);
    if (!focusable.length) return;

    const active = document.activeElement as TvFocusable | null;
    const activeIndex = Math.max(0, focusable.findIndex((item) => item === active));
    const current = focusable[activeIndex] || focusable[0];
    const currentRect = current.getBoundingClientRect();

    const candidates = focusable
      .map((item, index) => ({ index, rect: item.getBoundingClientRect() }))
      .filter(({ index }) => index !== activeIndex)
      .filter(({ rect }) => {
        if (direction === "right") return rect.left > currentRect.left + 24;
        if (direction === "left") return rect.right < currentRect.right - 24;
        if (direction === "down") return rect.top > currentRect.top + 24;
        return rect.bottom < currentRect.bottom - 24;
      })
      .sort((a, b) => {
        const aHorizontal = Math.abs(a.rect.left - currentRect.left);
        const bHorizontal = Math.abs(b.rect.left - currentRect.left);
        const aVertical = Math.abs(a.rect.top - currentRect.top);
        const bVertical = Math.abs(b.rect.top - currentRect.top);

        if (direction === "left" || direction === "right") {
          return aVertical - bVertical || aHorizontal - bHorizontal;
        }

        return aHorizontal - bHorizontal || aVertical - bVertical;
      });

    if (typeof candidates[0]?.index === "number") {
      focusItem(focusable, candidates[0].index);
    }
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

      if ((event.key === "Enter" || event.key === " ") && document.activeElement instanceof HTMLElement) {
        event.preventDefault();
        document.activeElement.click();
      }
    },
    [moveFocus]
  );

  const openChannel = useCallback(
    (channel: VodChannel) => {
      const nextStack = [toVodNode(channel)];
      setNavigationStack(nextStack);
      updatePath(nextStack);
    },
    [updatePath]
  );

  const openItem = useCallback(
    (item: VodItem) => {
      if (item.isFolder) {
        setNavigationStack((stack) => {
          const nextStack = [...stack, itemToVodNode(item)];
          updatePath(nextStack);
          return nextStack;
        });
        return;
      }

      if (!item.isPlayable) return;

      saveRecentItem(item, navigationStack);
      play(itemToChannel(item, navigationStack), { fullscreen: true });
    },
    [navigationStack, play, updatePath]
  );

  const goBack = useCallback(() => {
    if (!navigationStack.length) {
      router.push("/tv");
      return;
    }

    const nextStack = navigationStack.slice(0, -1);
    setNavigationStack(nextStack);
    updatePath(nextStack);
  }, [navigationStack, router, updatePath]);

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
        <header className="tv-panel mb-9 flex shrink-0 items-center justify-between gap-8 rounded-[2rem] px-8 py-7">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-primary shadow-lg">
              <Clapperboard className="h-9 w-9 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-5xl font-bold tracking-tight">{title}</h1>
              <p className="mt-2 truncate text-xl text-muted-foreground">{description}</p>
              {shownNodes.length > 0 && (
                <div className="mt-3 flex min-w-0 items-center gap-2 text-lg text-muted-foreground">
                  <span className="shrink-0">VOD</span>
                  {shownNodes.map((node, index) => (
                    <span
                      key={`${node.module}:${node.mode}:${node.url}:${index}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" />
                      <span className="max-w-56 truncate">{node.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={goBack}
            className="tv-focus-card flex h-20 shrink-0 items-center gap-3 rounded-3xl border border-border bg-card px-8 text-2xl font-bold transition hover:border-primary/60 hover:bg-secondary"
          >
            <ArrowRight className="h-7 w-7" />
            חזרה
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-2 styled-scrollbar">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-6 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-80 animate-pulse rounded-3xl border border-border bg-card"
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-96 items-center justify-center">
              <div className="space-y-5 rounded-3xl border border-border bg-card p-10 text-center">
                <p className="text-3xl font-bold text-destructive">שגיאה בטעינת ה-VOD</p>
                {currentNode && (
                  <button
                    type="button"
                    onClick={() => retryItems()}
                    className="tv-focus-card rounded-2xl border border-border px-7 py-4 text-xl font-bold transition hover:bg-secondary"
                  >
                    נסה שוב
                  </button>
                )}
              </div>
            </div>
          ) : currentNode ? (
            items.length > 0 ? (
              <div className="grid grid-cols-3 gap-6 2xl:grid-cols-4">
                {items.map((item) => (
                  <VodItemCard key={item.id} item={item} onOpen={() => openItem(item)} />
                ))}
              </div>
            ) : (
              <EmptyState label="לא נמצא תוכן בתיקייה הזו" />
            )
          ) : channels.length > 0 ? (
            <div className="grid grid-cols-3 gap-6 2xl:grid-cols-4">
              {channels.map((channel) => (
                <VodChannelCard
                  key={channel.id}
                  channel={channel}
                  onOpen={() => openChannel(channel)}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="לא נמצאו ספריות VOD" />
          )}
        </div>
      </main>
    </div>
  );
}

function VodChannelCard({
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
      className="tv-focus-card group flex h-80 flex-col overflow-hidden rounded-3xl border border-border bg-card/95 text-right transition hover:border-primary/60 hover:bg-secondary"
    >
      <div className="flex h-48 items-center justify-center bg-background p-8">
        <img
          src={getImageSrc(channel.logo)}
          alt=""
          className="h-full w-full object-contain transition-transform group-focus:scale-110"
        />
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-4 p-6">
        <Tv className="h-7 w-7 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-lg font-bold text-primary">ספריית VOD</p>
          <h2 className="mt-1 truncate text-3xl font-bold">{channel.name}</h2>
        </div>
      </div>
    </button>
  );
}

function VodItemCard({ item, onOpen }: { item: VodItem; onOpen: () => void }) {
  const isDisabled = !item.isFolder && !item.isPlayable;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isDisabled}
      className="tv-focus-card group flex h-[25rem] flex-col overflow-hidden rounded-3xl border border-border bg-card/95 text-right transition hover:border-primary/60 hover:bg-secondary disabled:cursor-default disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
    >
      <div className="relative h-56 shrink-0 overflow-hidden bg-background">
        <img
          src={getImageSrc(item.logo)}
          alt=""
          className="h-full w-full object-cover object-top transition-transform group-focus:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
        <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-lg font-bold text-white">
          {item.isFolder ? <FolderOpen className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          {item.isFolder ? "תיקייה" : "נגן"}
        </span>
      </div>
      <div className="min-w-0 flex-1 p-6">
        <h2 className="line-clamp-2 text-3xl font-bold leading-tight">{item.name}</h2>
        {item.description && (
          <p className="mt-3 line-clamp-2 text-lg text-muted-foreground">{item.description}</p>
        )}
      </div>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-96 items-center justify-center rounded-3xl border border-border bg-card">
      <p className="text-3xl font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
