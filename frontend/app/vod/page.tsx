"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, ChevronLeft, Clapperboard, ExternalLink, FolderOpen, Play, Search } from "lucide-react";
import { channelService } from "@/lib/services/channel-service";
import { type Channel, type VodChannel, type VodItem, type VodPlaybackMeta } from "@/lib/channels-data";
import { useFloatingPlayer } from "@/context/floating-player-context";

const VOD_PATH_PARAM = "path";
const VOD_PLAY_PARAM = "play";

const fetchVodChannels = async (): Promise<VodChannel[]> => {
    return await channelService.getVodChannels();
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

const parseJsonParam = <T,>(value: string | null): T | null => {
    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

export default function VodPage() {
    const { play, setCloseHandler } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [navigationStack, setNavigationStack] = useState<VodNode[]>([]);
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
        return () => setCloseHandler(null);
    }, [setCloseHandler]);

    const goToPathLevel = (levelIndex: number) => {
        const nextStack = navigationStack.slice(0, levelIndex + 1);
        setSearchQuery("");
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const openChannel = (channel: VodChannel) => {
        const nextStack = [toVodNode(channel)];
        setSearchQuery("");
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const openItem = (item: VodItem) => {
        if (!item.isFolder) {
            if (item.isPlayable) {
                updateUrl(navigationStack, item);
                play(itemToChannel(item, navigationStack), {
                    onClose: () => updateUrl(navigationStack),
                });
            }
            return;
        }

        setSearchQuery("");
        setNavigationStack((stack) => {
            const nextStack = [...stack, itemToVodNode(item)];
            updateUrl(nextStack);
            return nextStack;
        });
    };

    return (
        <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
            <main className="flex-1 min-h-0 flex flex-col px-4 py-6 max-w-7xl mx-auto w-full overflow-hidden">
                <div className="mb-6 shrink-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div>
                        <div className="flex flex-wrap items-center gap-1 text-2xl font-bold text-foreground">
                            {currentNode ? (
                                navigationStack.map((node, index) => (
                                    <span key={`${node.module}:${node.mode}:${node.url}:${index}`} className="inline-flex items-center gap-1">
                                        {index > 0 && (
                                            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        {index === navigationStack.length - 1 ? (
                                            <span className="rounded bg-secondary px-1 text-primary">
                                                {node.name}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => goToPathLevel(index)}
                                                className="rounded px-1 text-right text-muted-foreground transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                            >
                                                {node.name}
                                            </button>
                                        )}
                                    </span>
                                ))
                            ) : (
                                <h2>ערוצי VOD בעידן פלוס</h2>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentNode
                                ? currentNode.name
                                : "כל המקורות שהתוסף של IdanPlus מציג תחת VOD"}
                        </p>
                        </div>
                    </div>

                    <div className="relative w-full sm:w-80">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={currentNode ? "חיפוש תוכניות" : "חיפוש VOD"}
                            className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                        />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                    {!currentNode && isLoading ? (
                        <div className="py-12 text-center text-muted-foreground">טוען ערוצי VOD...</div>
                    ) : !currentNode && error ? (
                        <div className="py-12 text-center">
                            <p className="text-lg text-red-500">שגיאה בטעינת ערוצי ה-VOD</p>
                            <button onClick={() => mutate()} className="mt-4 underline">
                                נסה שוב
                            </button>
                        </div>
                    ) : (
                        <>
                            {!currentNode ? (
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                                    {filteredChannels.map((channel) => (
                                        <button
                                            key={channel.id}
                                            onClick={() => openChannel(channel)}
                                            className="group relative flex min-h-52 flex-col items-center justify-between rounded-xl border border-border bg-card p-5 text-center transition-colors hover:border-primary/50 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                                        >
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary transition-colors group-hover:border-primary/50">
                                                    <img
                                                        src={getImageSrc(channel.logo)}
                                                        alt=""
                                                        className="h-full w-full object-contain p-2"
                                                    />
                                                </div>

                                                <div>
                                                    <h3 className="text-base font-semibold text-foreground">{channel.name}</h3>
                                                    <p className="mt-1 text-xs text-muted-foreground">{channel.module}</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center gap-2 text-xs">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                                                    <Clapperboard className="h-3.5 w-3.5" />
                                                    VOD
                                                </span>
                                                {channel.url ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        אתר
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                                                        <Archive className="h-3.5 w-3.5" />
                                                        פנימי
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : isItemsLoading ? (
                                <div className="py-12 text-center text-muted-foreground">טוען תוכניות...</div>
                            ) : itemsError ? (
                                <div className="py-12 text-center">
                                    <p className="text-lg text-red-500">שגיאה בטעינת התוכניות</p>
                                    <button onClick={() => mutateItems()} className="mt-4 underline">
                                        נסה שוב
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {filteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => openItem(item)}
                                            disabled={!item.isFolder && !item.isPlayable}
                                            className="group flex min-h-36 items-center gap-4 rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/50 hover:bg-secondary disabled:cursor-default disabled:hover:border-border disabled:hover:bg-card"
                                        >
                                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                                                <img
                                                    src={getImageSrc(item.logo)}
                                                    alt=""
                                                    className="h-full w-full object-contain p-2"
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
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
                                <div className="py-12 text-center text-lg text-muted-foreground">
                                    לא נמצאו ערוצי VOD
                                </div>
                            )}

                            {filteredItems.length === 0 && currentNode && !isItemsLoading && !itemsError && (
                                <div className="py-12 text-center text-lg text-muted-foreground">
                                    לא נמצאו תוכניות
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

        </div>
    );
}
