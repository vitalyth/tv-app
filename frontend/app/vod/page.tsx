"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Archive, ChevronLeft, Clapperboard, ExternalLink, FolderOpen, Play, Search } from "lucide-react";
import Header from "@/components/Header";
import { channelService } from "@/lib/services/channel-service";
import { type Channel, type VodChannel, type VodItem } from "@/lib/channels-data";
import { useDraggable } from "@/hooks/useDraggable";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then((m) => m.VideoPlayer),
    { ssr: false }
);

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
});

const itemToVodNode = (item: VodItem): VodNode => ({
    name: item.name,
    module: item.module,
    mode: item.mode,
    url: item.url,
    logo: item.logo,
    moreData: item.moreData,
});

const itemToChannel = (item: VodItem): Channel => ({
    id: item.id,
    index: 0,
    name: item.name,
    logo: item.logo,
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
});

const parseJsonParam = <T,>(value: string | null): T | null => {
    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

export default function VodPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [navigationStack, setNavigationStack] = useState<VodNode[]>([]);
    const [selectedItem, setSelectedItem] = useState<Channel | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const playerRef = useRef<HTMLDivElement>(null);
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
        setSelectedItem(item ? itemToChannel(item) : null);
        setIsFullscreen(false);
    }, []);

    useEffect(() => {
        syncFromUrl();
        window.addEventListener("popstate", syncFromUrl);

        return () => window.removeEventListener("popstate", syncFromUrl);
    }, [syncFromUrl]);

    const goBack = () => {
        setSearchQuery("");
        setSelectedItem(null);
        setNavigationStack((stack) => {
            const nextStack = stack.slice(0, -1);
            updateUrl(nextStack);
            return nextStack;
        });
    };

    const openChannel = (channel: VodChannel) => {
        const nextStack = [toVodNode(channel)];
        setSearchQuery("");
        setSelectedItem(null);
        setNavigationStack(nextStack);
        updateUrl(nextStack);
    };

    const openItem = (item: VodItem) => {
        if (!item.isFolder) {
            if (item.isPlayable) {
                setSelectedItem(itemToChannel(item));
                setIsFullscreen(false);
                updateUrl(navigationStack, item);
            }
            return;
        }

        setSearchQuery("");
        setSelectedItem(null);
        setNavigationStack((stack) => {
            const nextStack = [...stack, itemToVodNode(item)];
            updateUrl(nextStack);
            return nextStack;
        });
    };

    const { position, isDragging, dragHandleProps, restorePosition } = useDraggable(
        playerRef,
        !!selectedItem && !isFullscreen
    );

    const handleClosePlayer = useCallback(() => {
        setSelectedItem(null);
        setIsFullscreen(false);
        restorePosition(true);
        updateUrl(navigationStack);
    }, [navigationStack, restorePosition, updateUrl]);

    const handleResizePlayer = useCallback(() => {
        setIsFullscreen((current) => {
            const next = !current;
            if (current && !next) restorePosition();
            return next;
        });
    }, [restorePosition]);

    useEffect(() => {
        if (!selectedItem) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleClosePlayer();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);

        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [selectedItem, handleClosePlayer]);

    const playerStyle: React.CSSProperties =
        position && !isFullscreen
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                transform: `translate(${position.x}px, ${position.y}px)`,
                zIndex: 200,
                transition: isDragging ? "none" : "box-shadow 0.2s",
                boxShadow: isDragging
                    ? "0 24px 64px rgba(0,0,0,0.7)"
                    : "0 8px 32px rgba(0,0,0,0.5)",
            }
            : {};

    return (
        <div className="min-h-screen flex flex-col bg-background" dir="rtl">
            <Header title="VOD" />

            <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
                {selectedItem && (
                    <div
                        ref={playerRef}
                        style={playerStyle}
                        className={
                            position && !isFullscreen
                                ? "player-dragged"
                                : isFullscreen
                                    ? "player-overlay-fullscreen"
                                    : "player-overlay"
                        }
                    >
                        {!isFullscreen && (
                            <div
                                {...dragHandleProps}
                                className="player-drag-handle"
                                title="גרור להזזה"
                            >
                                <span className="drag-line" />
                            </div>
                        )}

                        <VideoPlayer
                            className="h-full w-full"
                            channel={selectedItem}
                            onClose={handleClosePlayer}
                            onResize={handleResizePlayer}
                        />
                    </div>
                )}

                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        {currentNode && (
                            <button
                                onClick={goBack}
                                className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                                aria-label="חזרה"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                        )}
                        <div>
                        <h2 className="text-2xl font-bold text-foreground">
                            {currentNode ? currentNode.name : "ערוצי VOD בעידן פלוס"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentNode
                                ? "תוכניות, קטגוריות ופריטים מתוך מקור ה-VOD"
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
            </main>

            <style jsx global>{`
                .player-overlay,
                .player-dragged,
                .player-overlay-fullscreen {
                    aspect-ratio: 16 / 9;
                    z-index: 200;
                    overflow: hidden;
                }

                .player-overlay,
                .player-dragged {
                    border-radius: 10px;
                }

                .player-overlay {
                    position: fixed;
                    width: clamp(400px, 40vw, 700px);
                    height: auto;
                    bottom: 20px;
                    right: 20px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }

                .player-dragged {
                    width: clamp(400px, 40vw, 700px);
                    height: auto;
                    will-change: transform;
                }

                .player-overlay-fullscreen {
                    position: fixed;
                    width: 99vw;
                    height: 99vh;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    border-radius: 0;
                }

                @media (max-width: 499px) {
                    .player-overlay,
                    .player-dragged {
                        position: fixed;
                        width: calc(100vw - 16px);
                        height: auto;
                        left: 8px;
                        right: 8px;
                        bottom: 8px;
                        transform: none;
                    }
                }

                .player-drag-handle {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 28px;
                    background: linear-gradient(
                        to bottom,
                        rgba(0, 0, 0, 0.65) 0%,
                        rgba(0, 0, 0, 0.0) 100%
                    );
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 210;
                    border-radius: 10px 10px 0 0;
                    opacity: 0;
                    pointer-events: auto;
                    transition: opacity 0.2s;
                }

                .player-dragged:hover .player-drag-handle,
                .player-overlay:hover .player-drag-handle {
                    opacity: 1;
                }

                .drag-line {
                    width: 70px;
                    height: 4px;
                    background: rgba(255,255,255,0.7);
                    border-radius: 2px;
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
}
