"use client";

import { useCallback, useMemo, useState } from "react";
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
        if (!query) return stations;

        return stations.filter((station) =>
            [station.name, station.module, station.category]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(query))
        );
    }, [searchQuery, stations]);

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
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="חפש תחנה..."
                        className="h-10 bg-card pr-10"
                    />
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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filteredStations.map((station) => (
                        <RadioStationCard
                            key={station.id}
                            station={station}
                            isActive={currentChannel?.id === station.id}
                            nowPlaying={currentChannel?.id === station.id ? nowPlaying : null}
                            onPlay={handlePlay}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                    לא נמצאו תחנות
                </div>
            )}
        </PageMain>
    );
}
