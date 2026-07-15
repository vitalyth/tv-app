"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel, Program } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";
import { getPersistedCastChannelId } from "@/hooks/useGoogleCast";
import { usePlayer } from "@/context/player-context";

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
    const { currentChannel, play, showProgramDetails } = usePlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [epgByChannel, setEpgByChannel] = useState<Record<string, Program[]>>({});
    const [guideRange, setGuideRange] = useState<{ start: number; end: number } | null>(null);
    const loadedRangeRef = useRef<{ start: number; end: number; query: string } | null>(null);
    const epgRequestCacheRef = useRef(new Map<string, Promise<Record<string, Program[]>>>());

    const loadEpg = useCallback((range: { start: number; end: number }, query = "", replace = false) => {
        const normalizedQuery = query.trim();
        const requestKey = `${range.start}:${range.end}:${normalizedQuery}`;
        const request = epgRequestCacheRef.current.get(requestKey) ?? channelService.getEpg({
            ...range,
            q: normalizedQuery || undefined,
        })
            .then((epg) => (epg && typeof epg === "object" ? epg as Record<string, Program[]> : {}))
            .finally(() => {
                epgRequestCacheRef.current.delete(requestKey);
            });

        epgRequestCacheRef.current.set(requestKey, request);

        return request
            .then((epg) => {
                setEpgByChannel((current) => replace ? epg : mergeEpg(current, epg));
                loadedRangeRef.current = { ...range, query: normalizedQuery };
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (!guideRange) return;

        const searchText = searchQuery.trim();
        const loadedRange = loadedRangeRef.current;
        if (
            loadedRange &&
            loadedRange.query === searchText &&
            guideRange.start >= loadedRange.start &&
            guideRange.end <= loadedRange.end
        ) {
            return;
        }

        const timeout = window.setTimeout(() => {
            loadEpg(guideRange, searchText, !loadedRange || loadedRange.query !== searchText);
        }, 120);

        return () => window.clearTimeout(timeout);
    }, [guideRange, loadEpg, searchQuery]);

    const handleGuideRangeChange = useCallback((range: { start: number; end: number }) => {
        setGuideRange((current) => {
            if (!current) {
                return range;
            }

            if (range.start >= current.start && range.end <= current.end) {
                return current;
            }

            if (range.start === current.start && range.end === current.end) {
                return current;
            }

            return {
                start: Math.min(current.start, range.start),
                end: Math.max(current.end, range.end),
            };
        });
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

    const handleProgramClick = useCallback((program: Program, ch: Channel, isLive: boolean) => {
        if (isLive) {
            playChannel(ch);
            return;
        }

        showProgramDetails(program, ch);
    }, [playChannel, showProgramDetails]);

    const hasVodForProgram = useCallback((program: Program) => {
        const nowSec = Math.floor(Date.now() / 1000);
        if (program.end > nowSec) return false;
        return Boolean(program.hasVod && program.vodMatch);
    }, []);

    const handleChannelClick = useCallback((ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const refreshNow = useCallback(() => {
        refresh();
        if (!guideRange) return;
        loadEpg(guideRange, searchQuery, true);
    }, [guideRange, loadEpg, refresh, searchQuery]);

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="mb-2 shrink-0 border-b border-border bg-background px-4 py-2">
                <ChannelsFilters
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    onRefresh={refreshNow}
                />
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
                        hasVodForProgram={hasVodForProgram}
                        guideStartSec={guideRange?.start}
                        guideEndSec={guideRange?.end}
                        onGuideRangeChange={handleGuideRangeChange}
                    />
                </div>
            </main>
        </div>
    );
}
