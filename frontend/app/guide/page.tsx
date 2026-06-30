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
import { X } from "lucide-react";

const SECS_PER_HOUR = 3600;
const INITIAL_HOURS_BACK = 1;
const INITIAL_HOURS_FORWARD = 5;

function formatProgramTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
}

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
    const { currentChannel, play, close } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [epgByChannel, setEpgByChannel] = useState<Record<string, Program[]>>({});
    const [selectedProgram, setSelectedProgram] = useState<{
        program: Program;
        channel: Channel;
    } | null>(null);
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

    useEffect(() => {
        const className = "floating-player-mobile-portrait-active";
        const isProgramDetailsOpen = Boolean(selectedProgram);

        document.documentElement.classList.toggle(className, isProgramDetailsOpen);

        return () => {
            if (isProgramDetailsOpen) {
                document.documentElement.classList.remove(className);
            }
        };
    }, [selectedProgram]);

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
            setSelectedProgram(null);
            playChannel(ch);
            return;
        }

        close();
        setSelectedProgram({ program, channel: ch });
    }, [close, playChannel]);

    const handleChannelClick = useCallback((ch: Channel) => {
        setSelectedProgram(null);
        playChannel(ch);
    }, [playChannel]);

    const refreshNow = useCallback(() => {
        refresh();
        loadEpg(guideRange, true);
    }, [guideRange, loadEpg, refresh]);

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
                        guideStartSec={guideRange.start}
                        guideEndSec={guideRange.end}
                        onGuideRangeChange={handleGuideRangeChange}
                    />
                </div>
            </main>
            {selectedProgram && (
                <div dir="rtl" className="player-overlay program-details-overlay border border-border bg-background">
                    <button
                        type="button"
                        onClick={() => setSelectedProgram(null)}
                        className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/45 text-white transition-colors hover:bg-black/65"
                        aria-label="סגור פרטי תוכנית"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {selectedProgram.program.image && (
                        <img
                            src={selectedProgram.program.image}
                            alt=""
                            className="h-1/2 w-full bg-muted object-cover"
                            loading="lazy"
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    )}
                    <div className={`${selectedProgram.program.image ? "h-1/2" : "h-full"} overflow-y-auto p-4 text-right`}>
                        <h2 className="text-base font-bold leading-6 text-foreground sm:text-xl sm:leading-7">
                            {selectedProgram.program.name}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                            {selectedProgram.channel.name} · {formatProgramTime(selectedProgram.program.start)} - {formatProgramTime(selectedProgram.program.end)}
                        </p>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                            {selectedProgram.program.description || "אין תיאור זמין לתוכנית הזו."}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
