"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ChevronLeft, Clapperboard, FolderOpen, Play, Search } from "lucide-react";
import { channelService } from "@/lib/services/channel-service";
import {
    type Channel,
    type VodChannel,
    type VodItem,
    type VodPlaybackMeta,
    getKanVodEpisodeId,
    getKanVodProgramId,
} from "@/lib/channels-data";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageMain } from "@/components/page-main";
import { useFloatingPlayer } from "@/context/floating-player-context";
import {
    ContinueWatchingVodCarousel,
    NewVodCarousel,
} from "@/components/vod-content-carousels";

const VOD_PATH_PARAM = "path";
const VOD_PLAY_PARAM = "play";
const VOD_RECENT_KEY = "vod_recently_watched";
const SEARCH_RESULT_LIMIT = 120;

interface RecentItem {
    item: VodItem;
    stack: VodNode[];
    watchedAt: number;
}

const loadRecentItems = (): RecentItem[] => {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(VOD_RECENT_KEY) || "[]");
    } catch {
        return [];
    }
};

const saveRecentItem = (item: VodItem, stack: VodNode[]) => {
    if (typeof window === "undefined") return;
    try {
        const existing = loadRecentItems().filter((r) => r.item.id !== item.id);
        const next: RecentItem[] = [{ item, stack, watchedAt: Date.now() }, ...existing];
        localStorage.setItem(VOD_RECENT_KEY, JSON.stringify(next));
    } catch {}
};

const fetchVodChannels = async (): Promise<VodChannel[]> => {
    return await channelService.getVodChannels();
};

const fetchVodRecent = async (): Promise<VodItem[]> => {
    return await channelService.getVodRecent();
};

const isKanVodChannel = (channel: VodChannel) => {
    const name = channel.name.trim();
    return channel.id === "kan" || name === "כאן 11";
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
    const titleParts = [
        vodMeta.channelName,
        vodMeta.programName,
    ].filter(Boolean);
    const subtitleParts = [
        vodMeta.seasonName,
        vodMeta.episodeName,
    ].filter(Boolean);
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

const parseJsonParam = <T,>(value: string | null): T | null => {
    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

export default function VodPage() {
    const router = useRouter();
    const { play, setCloseHandler } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [navigationStack, setNavigationStack] = useState<VodNode[]>([]);
    const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
    const { data: channels = [], isLoading, error, mutate } = useSWR(
        "vod-channels",
        fetchVodChannels,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
        }
    );

    const currentNode = navigationStack.at(-1) || null;
    const {
        data: vodRecentItems = [],
    } = useSWR("vod-page-vod-recent", fetchVodRecent, {
        refreshInterval: 5 * 60 * 1000,
        revalidateOnFocus: true,
        dedupingInterval: 60000,
    });
    const {
        data: items = [],
        isLoading: isItemsLoading,
        error: itemsError,
        mutate: mutateItems,
    } = useSWR(
        currentNode
            ? [
                "vod-items",
                currentNode.module,
                currentNode.mode,
                currentNode.url,
                currentNode.name,
                currentNode.logo,
                currentNode.moreData,
            ]
            : null,
        async ([, module, mode, url, name, iconimage, moreData]) => {
            return await channelService.getVodItems({
                module,
                mode,
                url,
                name,
                iconimage,
                moreData,
            }) as VodItem[];
        },
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
        }
    );

    const filteredChannels = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return channels;

        return channels.filter((channel) => {
            return (
                channel.name.toLowerCase().includes(query) ||
                channel.module.toLowerCase().includes(query)
            );
        });
    }, [channels, searchQuery]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return items;

        return items.filter((item) => {
            return (
                item.name.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query)
            );
        });
    }, [items, searchQuery]);

    const visibleFilteredItems = useMemo(() => {
        return searchQuery.trim() ? filteredItems.slice(0, SEARCH_RESULT_LIMIT) : filteredItems;
    }, [filteredItems, searchQuery]);

    const recentlyAddedItems = useMemo<RecentItem[]>(() => {
        return vodRecentItems.map((item) => ({
            item,
            stack: [
                {
                    name: item.channelName || item.programName || item.name,
                    module: item.module,
                    mode: item.mode,
                    url: item.url,
                    logo: item.channelImage || item.logo,
                    moreData: item.moreData,
                    description: item.description,
                },
            ],
            watchedAt: 0,
        }));
    }, [vodRecentItems]);

    const updateUrl = useCallback((stack: VodNode[], item?: VodItem | null) => {
        if (typeof window === "undefined") return;

        const nextUrl = new URL(window.location.href);

        if (stack.length > 0) {
            nextUrl.searchParams.set(VOD_PATH_PARAM, JSON.stringify(stack));
        } else {
            nextUrl.searchParams.delete(VOD_PATH_PARAM);
        }

        if (item) {
            nextUrl.searchParams.set(VOD_PLAY_PARAM, JSON.stringify(item));
        } else {
            nextUrl.searchParams.delete(VOD_PLAY_PARAM);
        }

        window.history.pushState(null, "", nextUrl);
    }, []);

    const syncFromUrl = useCallback(() => {
        if (typeof window === "undefined") return;

        const params = new URLSearchParams(window.location.search);
        const stack = parseJsonParam<VodNode[]>(params.get(VOD_PATH_PARAM));
        const item = parseJsonParam<VodItem>(params.get(VOD_PLAY_PARAM));

        setSearchQuery("");
        setNavigationStack(Array.isArray(stack) ? stack : []);
        if (item) {
            const nextStack = Array.isArray(stack) ? stack : [];
            play(itemToChannel(item, nextStack), {
                onClose: () => updateUrl(Array.isArray(stack) ? stack : []),
            });
        }
    }, [play, updateUrl]);

    useEffect(() => {
        syncFromUrl();
        window.addEventListener("popstate", syncFromUrl);

        return () => window.removeEventListener("popstate", syncFromUrl);
    }, [syncFromUrl]);

    useEffect(() => {
        setRecentItems(loadRecentItems());
    }, []);

    useEffect(() => {
        return () => setCloseHandler(null);
    }, [setCloseHandler]);

    const goToPathLevel = (levelIndex: number) => {
        if (levelIndex < 0) {
            setSearchQuery("");
            setNavigationStack([]);
            updateUrl([]);
            return;
        }

        const nextStack = navigationStack.slice(0, levelIndex + 1);
        setSearchQuery("");
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const openChannel = (channel: VodChannel) => {
        if (isKanVodChannel(channel)) {
            router.push("/kan-vod");
            return;
        }

        const nextStack = [toVodNode(channel)];
        setSearchQuery("");
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const openItem = (item: VodItem) => {
        if (!item.isFolder) {
            if (item.isPlayable) {
                updateUrl(navigationStack, item);
                saveRecentItem(item, navigationStack);
                setRecentItems(loadRecentItems());
                play(itemToChannel(item, navigationStack), {
                    onClose: () => updateUrl(navigationStack),
                });
            }
            return;
        }

        setSearchQuery("");
        const nextStack = [...navigationStack, itemToVodNode(item)];
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const playRecentItem = useCallback((item: VodItem, stack: VodNode[]) => {
        setNavigationStack(stack);
        updateUrl(stack, item);
        play(itemToChannel(item, stack), {
            onClose: () => updateUrl(stack),
        });
    }, [play, updateUrl]);

    const continueRecentItem = useCallback((item: VodItem, stack: VodNode[]) => {
        const programId = getKanVodProgramId(
            item.module,
            item.programId,
            stack.map((node) => node.url),
        );

        if (item.module === "kan-vod" && programId) {
            play(itemToChannel(item, stack));
            router.push(`/kan-vod/${encodeURIComponent(programId)}`);
            return;
        }

        playRecentItem(item, stack);
    }, [play, playRecentItem, router]);

    return (
        <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
            <div className="mb-5 shrink-0 border-b border-border bg-background px-4 pb-4 pt-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                            {currentNode && navigationStack[0]?.logo ? (
                                <img
                                    src={getImageSrc(navigationStack[0].logo)}
                                    alt=""
                                    className="h-full w-full object-contain p-2"
                                />
                            ) : (
                                <Clapperboard className="h-6 w-6 text-primary" />
                            )}
                        </div>

                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-bold text-foreground">
                                {currentNode ? currentNode.name : "VOD"}
                            </h1>

                            <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                {currentNode ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => goToPathLevel(-1)}
                                            className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            VOD
                                        </button>
                                        {navigationStack.map((node, index) => (
                                            <span key={`${node.module}:${node.mode}:${node.url}:${index}`} className="inline-flex items-center gap-1">
                                                <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
                                                {index === navigationStack.length - 1 ? (
                                                    <span className="rounded bg-secondary px-1 font-medium text-foreground">
                                                        {node.name}
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => goToPathLevel(index)}
                                                        className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                                    >
                                                        {node.name}
                                                    </button>
                                                )}
                                            </span>
                                        ))}
                                    </>
                                ) : (
                                    <span>כל ספריות הצפייה במקום אחד, עם חזרה מהירה למה שהתחלת לראות</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <DebouncedSearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder={currentNode ? "חיפוש תוכניות" : "חיפוש VOD"}
                    />
                </div>
            </div>

            <PageMain>
                <div className="flex-1 px-4 pb-6">
                    {!currentNode && isLoading ? (
                        <section className="mb-8 space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <div key={index} className="h-44 animate-pulse rounded-lg border border-border bg-card" />
                                ))}
                            </div>
                        </section>
                    ) : !currentNode && error ? (
                        <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
                            <p className="text-base font-medium text-red-500">שגיאה בטעינת ערוצי ה-VOD</p>
                            <button onClick={() => mutate()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                                נסה שוב
                            </button>
                        </div>
                    ) : (
                        <>
                            {!currentNode ? (
                                <>
                                    <section className="mb-8 space-y-4">
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                                            {filteredChannels.map((channel) => (
                                                <button
                                                    key={channel.id}
                                                    onClick={() => openChannel(channel)}
                                                    className="group relative flex min-h-48 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-right shadow-sm transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/70 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/0 transition-colors duration-300 group-hover:bg-primary" />
                                                    <div className="flex h-28 w-full items-center justify-center border-b border-border bg-background/70 p-5">
                                                        <img
                                                            src={getImageSrc(channel.logo)}
                                                            alt={channel.name}
                                                            className="h-20 w-20 object-contain transition-transform duration-300 group-hover:scale-110"
                                                        />
                                                    </div>

                                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="mb-1 text-[10px] font-semibold text-primary">ספריית VOD</p>
                                                                <h3 className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary sm:text-base">
                                                                    {channel.name}
                                                                </h3>
                                                                <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">
                                                                    {channel.module}
                                                                </p>
                                                            </div>
                                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-[transform,border-color,color] group-hover:-translate-x-1 group-hover:border-primary/60 group-hover:text-primary">
                                                                <ChevronLeft className="h-3.5 w-3.5" />
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-1 text-[10px]">
                                                            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                                                <Clapperboard className="h-3 w-3" />
                                                                VOD
                                                            </span>
                                                            {!channel.url && (
                                                                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                                                    <Archive className="h-3 w-3" />
                                                                    פנימי
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    <NewVodCarousel
                                        items={recentlyAddedItems}
                                        compact
                                        buildMeta={buildVodMeta}
                                        getImageSrc={getImageSrc}
                                        onPlay={continueRecentItem}
                                    />

                                    <ContinueWatchingVodCarousel
                                        items={recentItems}
                                        compact
                                        buildMeta={buildVodMeta}
                                        getImageSrc={getImageSrc}
                                        onPlay={continueRecentItem}
                                    />
                                </>
                            ) : isItemsLoading ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {Array.from({ length: 8 }).map((_, index) => (
                                        <div key={index} className="h-56 animate-pulse rounded-lg border border-border bg-card" />
                                    ))}
                                </div>
                            ) : itemsError ? (
                                <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
                                    <p className="text-base font-medium text-red-500">שגיאה בטעינת התוכניות</p>
                                    <button onClick={() => mutateItems()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                                        נסה שוב
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {visibleFilteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => openItem(item)}
                                            disabled={!item.isFolder && !item.isPlayable}
                                            className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary disabled:cursor-default disabled:opacity-70 disabled:hover:border-border disabled:hover:bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <div className="relative aspect-video overflow-hidden bg-background">
                                                <img
                                                    src={getImageSrc(item.logo)}
                                                    alt=""
                                                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                                                />
                                                <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent" />

                                                <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                                                    {item.isFolder ? (
                                                        <>
                                                            <FolderOpen className="h-3.5 w-3.5" />
                                                            תיקייה
                                                        </>
                                                    ) : item.isPlayable ? (
                                                        <>
                                                            <Play className="h-3.5 w-3.5" />
                                                            פרק
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Archive className="h-3.5 w-3.5" />
                                                            פריט
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="min-w-0 p-4">
                                                <h3 className="line-clamp-2 text-base font-semibold text-foreground">
                                                    {item.name}
                                                </h3>
                                                {item.description && (
                                                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {filteredChannels.length === 0 && !currentNode && (
                                <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
                                    <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                                    <p className="text-base font-medium text-foreground">לא נמצאו ערוצי VOD</p>
                                    <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר.</p>
                                </div>
                            )}

                            {filteredItems.length === 0 && currentNode && !isItemsLoading && !itemsError && (
                                <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
                                    <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                                    <p className="text-base font-medium text-foreground">לא נמצאו תוכניות</p>
                                    <p className="mt-1 text-sm text-muted-foreground">נסה חיפוש אחר או חזור לרמה קודמת.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </PageMain>

        </div>
    );
}
