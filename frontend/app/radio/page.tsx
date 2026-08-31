"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Play, Radio, RefreshCw, Search } from "lucide-react";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/context/player-context";
import { type Channel } from "@/lib/channels-data";
import { resolveImageSrc } from "@/lib/image-urls";
import { cn } from "@/lib/utils";
import { channelService } from "@/lib/services/channel-service";
import { radioNowPlayingText, type RadioNowPlaying, useRadioNowPlaying } from "@/hooks/useRadioNowPlaying";

const PAGE_SIZE = 48;

const RADIO_GROUPS = [
    { value: "", label: "הכל" },
    { value: "local", label: "מקומי" },
    { value: "israelis", label: "ישראלי" },
    { value: "world", label: "עולמי" },
] as const;

const fetchRadioChannels = async (): Promise<Channel[]> => {
    return await channelService.getRadioChannels();
};

function RadioStationCard({
    station,
    isActive,
    nowPlaying,
    onPlay,
}: {
    station: Channel;
    isActive: boolean;
    nowPlaying?: RadioNowPlaying | null;
    onPlay: (station: Channel) => void;
}) {
    const logo = resolveImageSrc(station.logo);
    const stationMeta = isActive
        ? radioNowPlayingText(nowPlaying)
        : station.module;

    return (
        <button
            type="button"
            onClick={() => onPlay(station)}
            aria-pressed={isActive}
            className={cn(
                "group flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-card p-5 text-center transition-colors",
                "hover:border-primary/50 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                isActive && "border-primary bg-primary/10 ring-2 ring-primary/70"
            )}
        >
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border bg-white">
                {logo ? (
                    <img
                        src={logo}
                        alt={station.name}
                        className="h-full w-full object-contain p-2"
                        loading="lazy"
                        onError={(event) => {
                            event.currentTarget.style.display = "none";
                        }}
                    />
                ) : (
                    <Radio className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
            </div>

            <div className="min-w-0">
                <h2 className="line-clamp-2 text-base font-bold leading-6 text-foreground">
                    {station.name}
                </h2>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {stationMeta}
                </p>
            </div>

            <span
                className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-bold transition-colors",
                    isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                )}
            >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                {isActive ? "מתנגן" : "הפעל"}
            </span>
        </button>
    );
}

export default function RadioPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const { currentChannel, play } = usePlayer();
    const activeRadioStationId = currentChannel?.type === "radio" && currentChannel.id ? currentChannel.id : null;
    const {
        data: stations = [],
        error,
        isLoading,
        isValidating,
        mutate,
    } = useSWR("radio-channels", fetchRadioChannels, {
        refreshInterval: 5 * 60 * 1000,
        revalidateOnFocus: true,
    });
    const { data: nowPlaying, mutate: refreshNowPlaying } = useRadioNowPlaying(currentChannel);

    const filteredStations = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return stations.filter((station) =>
            (!selectedGroup || station.group === selectedGroup) &&
            (!query ||
                [station.name, station.module, station.category, station.group]
                    .filter((value): value is string => Boolean(value))
                    .some((value) => value.toLowerCase().includes(query)))
        );
    }, [searchQuery, selectedGroup, stations]);

    const visibleStations = useMemo(
        () => filteredStations.slice(0, visibleCount),
        [filteredStations, visibleCount]
    );
    const hasMore = visibleStations.length < filteredStations.length;

    const groupCounts = useMemo(() => {
        return stations.reduce<Record<string, number>>((counts, station) => {
            const group = station.group || "israelis";
            counts[group] = (counts[group] || 0) + 1;
            return counts;
        }, {});
    }, [stations]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [searchQuery, selectedGroup]);

    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !hasMore) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredStations.length));
                }
            },
            { rootMargin: "320px" }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [filteredStations.length, hasMore, visibleStations.length]);

    const handleRefresh = useCallback(() => {
        return mutate();
    }, [mutate]);

    const handlePlay = useCallback(
        (station: Channel) => {
            play(station);
            if (station.id !== activeRadioStationId) {
                refreshNowPlaying(undefined, { revalidate: false });
            }
        },
        [activeRadioStationId, play, refreshNowPlaying]
    );

    return (
        <PageMain className="px-4 py-6">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="חפש תחנה..."
                        className="h-10 bg-card pr-10"
                    />
                </div>

                <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                        <div className="flex w-max gap-2">
                            {RADIO_GROUPS.map((group) => {
                                const count = group.value ? groupCounts[group.value] || 0 : stations.length;
                                return (
                                    <Button
                                        key={group.value || "all"}
                                        type="button"
                                        variant={selectedGroup === group.value ? "default" : "outline"}
                                        size="sm"
                                        aria-pressed={selectedGroup === group.value}
                                        onClick={() => setSelectedGroup(group.value)}
                                        className="h-10 whitespace-nowrap"
                                    >
                                        {group.label}
                                        <span className="rounded-full bg-background/30 px-1.5 text-[11px]">
                                            {count}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isValidating}
                        className="h-10 shrink-0"
                    >
                        <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} />
                        רענן
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                    טוען תחנות...
                </div>
            ) : error ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <p className="text-lg font-semibold text-red-500">שגיאה בטעינת תחנות הרדיו</p>
                    <Button type="button" variant="outline" onClick={handleRefresh}>
                        נסה שוב
                    </Button>
                </div>
            ) : filteredStations.length ? (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {visibleStations.map((station) => (
                            <RadioStationCard
                                key={station.id}
                                station={station}
                                isActive={currentChannel?.id === station.id}
                                nowPlaying={currentChannel?.id === station.id ? nowPlaying : null}
                                onPlay={handlePlay}
                            />
                        ))}
                    </div>

                    <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
                        {hasMore ? (
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                {visibleStations.length} מתוך {filteredStations.length}
                            </span>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                    לא נמצאו תחנות
                </div>
            )}
        </PageMain>
    );
}
