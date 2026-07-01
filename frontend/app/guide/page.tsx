"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import {
    Channel,
    Program,
    VodItem,
    VodPlaybackMeta,
    getKanVodEpisodeId,
    getKanVodProgramId,
} from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";
import {
    kanVodService,
    type KanVodEpisode,
    type KanVodSeriesDetails,
} from "@/lib/services/kan-vod-service";
import { getPersistedCastChannelId } from "@/hooks/useGoogleCast";
import { useFloatingPlayer } from "@/context/floating-player-context";

const SECS_PER_HOUR = 3600;
const INITIAL_HOURS_BACK = 3;
const INITIAL_HOURS_FORWARD = 5;

function normalizeProgramName(value?: string): string {
    return (value || "")
        .replace(/\s*[-–]\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*$/g, "")
        .replace(/\s*\|\s*/g, " ")
        .replace(/[״"׳'`]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function getChannelMatchKeysFromText(value?: string): Set<string> {
    const normalized = normalizeProgramName(value);
    const compact = normalized.replace(/\s+/g, "");
    const keys = new Set<string>();

    if (!normalized) return keys;

    if (compact.includes("קשת") || compact.includes("keshet") || compact === "12") {
        keys.add("keshet-12");
    }
    if (compact.includes("רשת") || compact.includes("reshet") || compact === "13") {
        keys.add("reshet-13");
    }
    if (
        compact.includes("עכשיו14") ||
        compact.includes("ערוץ14") ||
        compact === "14" ||
        compact.includes("14tv") ||
        compact.includes("now14") ||
        compact.includes("c14") ||
        compact.includes("channel14")
    ) {
        keys.add("channel-14");
    }
    if ((compact.includes("כאן") || compact.includes("kan")) && compact.includes("11")) {
        keys.add("kan-11");
    }
    if ((compact.includes("חינוכית") || compact.includes("kan")) && compact.includes("23")) {
        keys.add("kan-23");
    }
    if ((compact.includes("מכאן") || compact.includes("makan") || compact.includes("kan")) && compact.includes("33")) {
        keys.add("kan-33");
    }
    if (compact.includes("i24") || compact.includes("i24news")) {
        keys.add("i24news");
    }
    if (compact.includes("כלכלה") && compact.includes("10")) {
        keys.add("calcalah-10");
    }
    if (compact.includes("כנסת") || compact.includes("knesset")) {
        keys.add("knesset");
    }

    return keys;
}

function getChannelMatchKeys(channel: Channel): Set<string> {
    const keys = new Set<string>();

    [
        channel.name,
        channel.id,
        channel.channelID,
        channel.tvgID,
        channel.module,
    ].forEach((value) => {
        getChannelMatchKeysFromText(value).forEach((key) => keys.add(key));
    });

    return keys;
}

function getVodItemChannelMatchKeys(item: VodItem): Set<string> {
    const keys = new Set<string>();
    const vodChannelName = (item as VodItem & { vodChannelName?: string }).vodChannelName;

    [
        item.channelName,
        vodChannelName,
        item.module,
        item.logo,
        item.channelImage,
        item.url,
    ].forEach((value) => {
        getChannelMatchKeysFromText(value).forEach((key) => keys.add(key));
    });

    return keys;
}

function isSameVodChannel(channel: Channel, item: VodItem): boolean {
    const channelKeys = getChannelMatchKeys(channel);
    const vodKeys = getVodItemChannelMatchKeys(item);

    if (!channelKeys.size || !vodKeys.size) return false;

    return Array.from(channelKeys).some((key) => vodKeys.has(key));
}

function vodItemToChannel(item: VodItem): Channel {
    const vodMeta: VodPlaybackMeta = {
        programName: item.programName || item.name,
        seasonName: item.seasonName || item.season,
        channelName: item.channelName || (item as VodItem & { vodChannelName?: string }).vodChannelName || "VOD",
        episodeName: item.episodeName || item.title || item.name,
        episodeDescription: item.episodeDescription || item.description || item.plot,
        programDescription: item.programDescription || item.description || item.plot,
        programImage: item.programImage || item.logo,
        channelImage: item.channelImage || item.logo,
        episodeImage: item.episodeImage || item.logo,
    };

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
        playerTitle: [vodMeta.channelName, vodMeta.programName].filter(Boolean).join(" · "),
        playerSubtitle: [vodMeta.seasonName, vodMeta.episodeName].filter(Boolean).join(" · "),
        vodProgramId: getKanVodProgramId(item.module, item.programId, []),
        vodMeta,
    };
}

function findVodMatchForProgram(program: Program, channel: Channel, vodItems: VodItem[]): VodItem | null {
    const programName = normalizeProgramName(program.name);
    if (!programName) return null;

    const scored = vodItems
        .filter((item) => item.isPlayable && isSameVodChannel(channel, item))
        .map((item) => {
            const names = [
                item.programName,
                item.episodeName,
                item.title,
                item.name,
            ].map(normalizeProgramName).filter(Boolean);

            let score = 0;
            if (names.some((name) => name === programName)) score += 8;
            if (
                programName.length >= 8 &&
                names.some((name) => name.length >= 8 && (name.includes(programName) || programName.includes(name)))
            ) {
                score += 4;
            }

            return { item, score };
        })
        .filter(({ score }) => score >= 8)
        .sort((a, b) => b.score - a.score);

    return scored[0]?.item ?? null;
}

function isKanChannel(channel: Channel): boolean {
    const id = `${channel.id} ${channel.channelID || ""} ${channel.tvgID || ""}`.toLowerCase();
    const name = channel.name.replace(/\s+/g, "");

    return (
        channel.module === "kan" ||
        channel.module === "kan-vod" ||
        id.includes("ch_11") ||
        id.includes("kan") ||
        name.includes("כאן11")
    );
}

function getKanVodSearchQueries(program: Program): string[] {
    const normalized = normalizeProgramName(program.name);
    const queries: string[] = [];

    if (
        normalized.includes("מהדורת כאן חדשות") ||
        normalized.includes("חדשות כאן") ||
        normalized.includes("חדשות הערב")
    ) {
        queries.push("מהדורת כאן חדשות");
    }

    if (normalized.includes("כאן בשש")) {
        queries.push("כאן בשש");
    }

    if (normalized.includes("העולם היום")) {
        queries.push("העולם היום");
    }

    if (normalized.includes("בנימיני וגואטה")) {
        queries.push("בנימיני וגואטה");
    }

    if (normalized.includes("שלוש")) {
        queries.push("שלוש");
    }

    if (normalized.includes("שבע")) {
        queries.push("שבע");
    }

    return Array.from(new Set(queries.filter(Boolean)));
}

function findKanEpisodeMatch(program: Program, series: KanVodSeriesDetails): KanVodEpisode | null {
    const programName = normalizeProgramName(program.name);
    const kanAliases = getKanVodSearchQueries(program).map(normalizeProgramName);
    const acceptedNames = [programName, ...kanAliases].filter(Boolean);
    if (!acceptedNames.length) return null;

    return series.episodes.find((episode) => {
        const episodeNames = [
            episode.episodeName,
            episode.title,
        ].map(normalizeProgramName).filter(Boolean);

        return episodeNames.some((name) =>
            acceptedNames.some((accepted) =>
                name === accepted ||
                (accepted.length >= 8 && name.includes(accepted))
            )
        );
    }) ?? null;
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
    const { currentChannel, play, playKanVodEpisode, showProgramDetails } = useFloatingPlayer();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [epgByChannel, setEpgByChannel] = useState<Record<string, Program[]>>({});
    const { data: vodRecentItems = [] } = useSWR(
        "guide-vod-recent",
        () => channelService.getVodRecent() as Promise<VodItem[]>,
        {
            refreshInterval: 5 * 60 * 1000,
            revalidateOnFocus: true,
            dedupingInterval: 60000,
        }
    );
    const initialNowRef = useRef(Math.floor(Date.now() / 1000));
    const [guideRange, setGuideRange] = useState(() => {
        const start = Math.floor(
            (initialNowRef.current - INITIAL_HOURS_BACK * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const end = start + (INITIAL_HOURS_BACK + INITIAL_HOURS_FORWARD) * SECS_PER_HOUR;

        return { start, end };
    });
    const loadedRangeRef = useRef<{ start: number; end: number } | null>(null);
    const kanVodMatchCacheRef = useRef(new Map<string, { series: KanVodSeriesDetails; episode: KanVodEpisode } | null>());
    const [kanVodProgramKeys, setKanVodProgramKeys] = useState<Set<string>>(() => new Set());

    const cacheKanVodMatch = useCallback((cacheKey: string, match: { series: KanVodSeriesDetails; episode: KanVodEpisode } | null) => {
        kanVodMatchCacheRef.current.set(cacheKey, match);

        if (match) {
            setKanVodProgramKeys((current) => {
                if (current.has(cacheKey)) return current;
                const next = new Set(current);
                next.add(cacheKey);
                return next;
            });
        }
    }, []);

    const ensureKanVodMatch = useCallback(async (program: Program) => {
        const queries = getKanVodSearchQueries(program);
        const cacheKey = normalizeProgramName(queries.join("|"));
        if (!cacheKey) return null;

        if (kanVodMatchCacheRef.current.has(cacheKey)) {
            return kanVodMatchCacheRef.current.get(cacheKey) ?? null;
        }

        try {
            const results = await Promise.all(
                queries.map((query) => kanVodService.getSeries({ query, limit: 5 }).catch(() => null))
            );
            const series = results
                .flatMap((result) => result?.series ?? [])
                .find(Boolean);

            if (!series) {
                cacheKanVodMatch(cacheKey, null);
                return null;
            }

            const details = await kanVodService.getSeriesDetails(series.id);
            const episode = findKanEpisodeMatch(program, details);
            if (!episode) {
                cacheKanVodMatch(cacheKey, null);
                return null;
            }

            const match = { series: details, episode };
            cacheKanVodMatch(cacheKey, match);
            return match;
        } catch {
            cacheKanVodMatch(cacheKey, null);
            return null;
        }
    }, [cacheKanVodMatch]);

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
        const nowSec = Math.floor(Date.now() / 1000);
        const candidates = channelsWithEpg
            .filter(isKanChannel)
            .flatMap((channel) => channel.programs)
            .filter((program) => program.end <= nowSec)
            .filter((program) => {
                const cacheKey = normalizeProgramName(getKanVodSearchQueries(program).join("|"));
                return cacheKey && !kanVodMatchCacheRef.current.has(cacheKey);
            })
            .slice(0, 8);

        if (!candidates.length) return;

        candidates.forEach((program) => {
            ensureKanVodMatch(program).catch(() => undefined);
        });
    }, [channelsWithEpg, ensureKanVodMatch, guideRange]);

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

        const nowSec = Math.floor(Date.now() / 1000);
        if (program.end <= nowSec) {
            const vodMatch = findVodMatchForProgram(program, ch, vodRecentItems);
            if (vodMatch) {
                play(vodItemToChannel(vodMatch));
                return;
            }

            if (isKanChannel(ch)) {
                const queries = getKanVodSearchQueries(program);
                const cacheKey = normalizeProgramName(queries.join("|"));
                if (!cacheKey) {
                    showProgramDetails(program, ch);
                    return;
                }
                const cached = kanVodMatchCacheRef.current.get(cacheKey);

                if (cached) {
                    playKanVodEpisode(cached.series, cached.episode);
                    return;
                }

                if (cached === null) {
                    showProgramDetails(program, ch);
                    return;
                }

                ensureKanVodMatch(program)
                    .then((match) => {
                        if (match) {
                            playKanVodEpisode(match.series, match.episode);
                            return;
                        }

                        showProgramDetails(program, ch);
                    })
                return;
            }
        }

        showProgramDetails(program, ch);
    }, [ensureKanVodMatch, play, playChannel, playKanVodEpisode, showProgramDetails, vodRecentItems]);

    const hasVodForProgram = useCallback((program: Program, channel: Channel) => {
        const nowSec = Math.floor(Date.now() / 1000);
        if (program.end > nowSec) return false;

        const programName = normalizeProgramName(program.name);
        if (!programName) return false;

        if (findVodMatchForProgram(program, channel, vodRecentItems)) return true;

        const kanCacheKey = isKanChannel(channel)
            ? normalizeProgramName(getKanVodSearchQueries(program).join("|"))
            : "";
        if (kanCacheKey && kanVodProgramKeys.has(kanCacheKey)) return true;

        return false;
    }, [kanVodProgramKeys, vodRecentItems]);

    const handleChannelClick = useCallback((ch: Channel) => {
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
                        hasVodForProgram={hasVodForProgram}
                        guideStartSec={guideRange.start}
                        guideEndSec={guideRange.end}
                        onGuideRangeChange={handleGuideRangeChange}
                    />
                </div>
            </main>
        </div>
    );
}
