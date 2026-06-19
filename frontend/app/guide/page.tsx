"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel, Program } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";
import { getPersistedCastChannelId } from "@/hooks/useGoogleCast";
import { useFloatingPlayer } from "@/context/floating-player-context";
import { Tv } from "lucide-react";

const SECS_PER_HOUR = 3600;
const INITIAL_HOURS_BACK = 1;
const INITIAL_HOURS_FORWARD = 12;

function dedupeAndSortPrograms(programs: Program[]): Program[] {
    const byKey = new Map<string, Program>();

    programs.forEach((program) => {
        byKey.set(`${program.start}:${program.end}:${program.name}`, program);
    });

    return Array.from(byKey.values()).sort((a, b) => a.start - b.start);
}

function mergeEpg(
    current: Record<string, Program[]>,
    next: Record<string, Program[]>
): Record<string, Program[]> {
    const merged = { ...current };

    Object.entries(next).forEach(([channelId, programs]) => {
        merged[channelId] = dedupeAndSortPrograms([...(merged[channelId] ?? []), ...programs]);
    });

    return merged;
}

export default function GuidePage() {
    const { channels, refresh } = useChannelsContext();
    const { currentChannel, play } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [epgByChannel, setEpgByChannel] = useState<Record<string, Program[]>>({});
    const initialNowRef = useRef(Math.floor(Date.now() / 1000));
    const [guideRange, setGuideRange] = useState(() => {
        const start = Math.floor(
            (initialNowRef.current - INITIAL_HOURS_BACK * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const end = start + (INITIAL_HOURS_BACK + INITIAL_HOURS_FORWARD) * SECS_PER_HOUR;

        return { start, end };
    });
    const loadedRangeRef = useRef<{ start: number; end: number } | null>(null);

    const loadEpg = useCallback((range: { start: number; end: number }, replace = false) => {
        return channelService.getEpg(range)
            .then((epg) => {
                if (epg && typeof epg === "object") {
                    const epgMap = epg as Record<string, Program[]>;
                    setEpgByChannel((current) => replace ? epgMap : mergeEpg(current, epgMap));
                    loadedRangeRef.current = range;
                }
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadedRange = loadedRangeRef.current;
        if (loadedRange && guideRange.start >= loadedRange.start && guideRange.end <= loadedRange.end) {
            return () => {
                cancelled = true;
            };
        }

        channelService.getEpg(guideRange)
            .then((epg) => {
                if (!cancelled && epg && typeof epg === "object") {
                    const epgMap = epg as Record<string, Program[]>;
                    setEpgByChannel((current) => loadedRange ? mergeEpg(current, epgMap) : epgMap);
                    loadedRangeRef.current = guideRange;
                }
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [guideRange]);

    const handleGuideRangeChange = useCallback((range: { start: number; end: number }) => {
        setGuideRange(range);
    }, []);

    const channelsWithEpg = useMemo(
        () => channels.map((channel) => ({
            ...channel,
            programs: channel.tvgID ? epgByChannel[channel.tvgID] ?? channel.programs : channel.programs,
        })),
        [channels, epgByChannel]
    );

    const filteredChannels = useFilteredChannels(channelsWithEpg, searchQuery, selectedCategory);

    // Restore Cast session after page refresh:
    // When channels finish loading, check if there was an active Cast session
    // before the refresh. If so, reselect the channel so the Cast SDK can
    // resume the session automatically (SESSION_RESUMED fires in useGoogleCast).
    useEffect(() => {
        if (!channelsWithEpg.length || currentChannel) return;

        const restoredChannelId = getPersistedCastChannelId();
        if (!restoredChannelId) return;

        const channel = channelsWithEpg.find((ch) => ch.id === restoredChannelId);
        if (channel) {
            play(channel);
        }
    }, [channelsWithEpg, currentChannel, play]);

    const playChannel = useCallback((ch: Channel) => {
        play(ch);
    }, [play]);

    const handleProgramClick = useCallback((_program: Program, ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const handleChannelClick = useCallback((ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const refreshNow = useCallback(() => {
        refresh();
        loadEpg(guideRange, true);
    }, [guideRange, loadEpg, refresh]);

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="mb-4 shrink-0 border-b border-border bg-background px-4 pb-4 pt-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                            <Tv className="h-6 w-6 text-primary" />
                        </div>

                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-bold text-foreground">שידורים חיים</h1>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                <span>לוח שידורים וערוצים חיים</span>
                            </div>
                        </div>
                    </div>

                    <ChannelsFilters
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        onRefresh={refreshNow}
                    />
                </div>
            </div>

            <main className="flex-1 flex flex-col w-full px-4 pb-4 overflow-hidden">
                <div dir="ltr" className="relative flex-1 flex flex-col w-full overflow-hidden">
                    <ProgramGuide
                        channels={filteredChannels}
                        sourceChannels={channelsWithEpg}
                        logoBasePath="/ch/"
                        playingChannelId={currentChannel?.type === "vod" ? undefined : currentChannel?.id}
                        playingChannelIndex={currentChannel?.type === "vod" ? undefined : currentChannel?.index}
                        onChannelClick={handleChannelClick}
                        onProgramClick={handleProgramClick}
                        guideStartSec={guideRange.start}
                        guideEndSec={guideRange.end}
                        onGuideRangeChange={handleGuideRangeChange}
                    />
                </div>
            </main>
        </div>
    );
}
