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
    type KanVodProgramMatch,
} from "@/lib/services/kan-vod-service";
import { getPersistedCastChannelId } from "@/hooks/useGoogleCast";
import { useFloatingPlayer } from "@/context/floating-player-context";

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_STOP_WORDS = new Set([
    "של",
    "עם",
    "את",
    "על",
    "כל",
    "לא",
    "גם",
    "או",
    "זה",
    "זו",
    "הוא",
    "היא",
    "הם",
    "הן",
    "יש",
    "אין",
    "עוד",
    "פרק",
    "עונה",
    "חדשות",
    "שידור",
    "ישיר",
    "live",
    "vod",
]);

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

function tokenizeMatchText(value?: string): string[] {
    const normalized = normalizeProgramName(value);
    if (!normalized) return [];

    return Array.from(new Set(
        normalized
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length >= 2)
            .filter((token) => !MATCH_STOP_WORDS.has(token))
            .filter((token) => !/^\d+$/.test(token))
    ));
}

function tokenOverlapScore(sourceTokens: string[], targetTokens: string[], maxScore: number): number {
    if (!sourceTokens.length || !targetTokens.length) return 0;

    const targetSet = new Set(targetTokens);
    const shared = sourceTokens.filter((token) => targetSet.has(token)).length;
    if (!shared) return 0;

    const sourceRatio = shared / sourceTokens.length;
    const targetRatio = shared / targetTokens.length;

    return Math.round(Math.max(sourceRatio, targetRatio) * maxScore);
}

function parseVodDate(value?: string): Date | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
        const timestamp = numeric > 10_000_000_000 ? numeric : numeric * 1000;
        const date = new Date(timestamp);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const dateMatch = trimmed.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dateDistanceDaysForValue(program: Program, value?: string): number | null {
    const vodDate = parseVodDate(value);
    if (!vodDate) return null;

    const programDate = new Date(program.start * 1000);
    return Math.abs(startOfLocalDay(programDate) - startOfLocalDay(vodDate)) / DAY_MS;
}

function programDateKey(program: Program): string {
    return new Date(program.start * 1000).toLocaleDateString("sv-SE");
}

function vodMatchCacheKey(program: Program): string {
    return [
        programDateKey(program),
        normalizeProgramName(program.name),
        normalizeProgramName(program.description),
    ].filter(Boolean).join("::");
}

function dateDistanceDays(program: Program, item: VodItem): number | null {
    const sourceTimestamp = (item as VodItem & { sourceTimestamp?: number }).sourceTimestamp;
    return dateDistanceDaysForValue(program, item.aired || (sourceTimestamp ? String(sourceTimestamp) : ""));
}

function scoreTextMatch(
    sourceText: string,
    targetTexts: string[],
    exactScore: number,
    partialScore: number,
    overlapScore: number
): number {
    const source = normalizeProgramName(sourceText);
    if (!source) return 0;

    const sourceTokens = tokenizeMatchText(source);

    return Math.max(
        0,
        ...targetTexts.map((targetText) => {
            const target = normalizeProgramName(targetText);
            if (!target) return 0;

            if (target === source) return exactScore;
            if (source.length >= 8 && target.length >= 8 && (target.includes(source) || source.includes(target))) {
                return partialScore;
            }

            return tokenOverlapScore(sourceTokens, tokenizeMatchText(target), overlapScore);
        })
    );
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
    const programDescription = normalizeProgramName(program.description);

    const scored = vodItems
        .filter((item) => item.isPlayable && isSameVodChannel(channel, item))
        .map((item) => {
            const itemNames = [
                item.programName,
                item.episodeName,
                item.title,
                item.name,
            ].filter(Boolean) as string[];
            const itemDescriptions = [
                item.episodeDescription,
                item.programDescription,
                item.description,
                item.plot,
            ].filter(Boolean) as string[];
            const titleScore = scoreTextMatch(program.name, itemNames, 42, 30, 26);
            const descriptionScore = programDescription
                ? scoreTextMatch(program.description, itemDescriptions, 22, 18, 22)
                : 0;
            const dateDistance = dateDistanceDays(program, item);
            const dateScore = dateDistance === null
                ? 0
                : dateDistance === 0
                    ? 24
                    : dateDistance <= 1
                        ? 10
                        : -24;
            const score = titleScore + descriptionScore + dateScore;
            const hasTextEvidence = titleScore >= 18 || descriptionScore >= 12;
            const hasDateConflict = dateDistance !== null && dateDistance > 1;

            return { item, score, titleScore, descriptionScore, hasTextEvidence, hasDateConflict };
        })
        .filter(({ score, titleScore, hasTextEvidence, hasDateConflict }) =>
            score >= 42 &&
            hasTextEvidence &&
            !hasDateConflict &&
            titleScore >= 12
        )
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
    const [guideRange, setGuideRange] = useState<{ start: number; end: number } | null>(null);
    const loadedRangeRef = useRef<{ start: number; end: number } | null>(null);
    const epgRequestCacheRef = useRef(new Map<string, Promise<Record<string, Program[]>>>());
    const kanVodMatchCacheRef = useRef(new Map<string, KanVodProgramMatch | null>());
    const vodAvailabilityCacheRef = useRef(new Map<string, boolean>());

    useEffect(() => {
        vodAvailabilityCacheRef.current.clear();
    }, [vodRecentItems]);

    const cacheKanVodMatch = useCallback((cacheKey: string, match: KanVodProgramMatch | null) => {
        kanVodMatchCacheRef.current.set(cacheKey, match);
    }, []);

    const ensureKanVodMatch = useCallback(async (program: Program) => {
        const cacheKey = vodMatchCacheKey(program);
        if (!cacheKey) return null;

        if (kanVodMatchCacheRef.current.has(cacheKey)) {
            return kanVodMatchCacheRef.current.get(cacheKey) ?? null;
        }

        try {
            const match = await kanVodService.matchProgram({
                name: program.name,
                description: program.description,
                start: program.start,
                end: program.end,
            });
            cacheKanVodMatch(cacheKey, match);
            return match;
        } catch {
            cacheKanVodMatch(cacheKey, null);
            return null;
        }
    }, [cacheKanVodMatch]);

    const loadEpg = useCallback((range: { start: number; end: number }, replace = false) => {
        const requestKey = `${range.start}:${range.end}`;
        const request = epgRequestCacheRef.current.get(requestKey) ?? channelService.getEpg(range)
            .then((epg) => (epg && typeof epg === "object" ? epg as Record<string, Program[]> : {}))
            .finally(() => {
                epgRequestCacheRef.current.delete(requestKey);
            });

        epgRequestCacheRef.current.set(requestKey, request);

        return request
            .then((epg) => {
                setEpgByChannel((current) => replace ? epg : mergeEpg(current, epg));
                loadedRangeRef.current = range;
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (!guideRange) return;

        const loadedRange = loadedRangeRef.current;
        if (loadedRange && guideRange.start >= loadedRange.start && guideRange.end <= loadedRange.end) {
            return;
        }

        const timeout = window.setTimeout(() => {
            loadEpg(guideRange, !loadedRange);
        }, 120);

        return () => window.clearTimeout(timeout);
    }, [guideRange, loadEpg]);

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

        const nowSec = Math.floor(Date.now() / 1000);
        if (program.end <= nowSec) {
            const vodMatch = findVodMatchForProgram(program, ch, vodRecentItems);
            if (vodMatch) {
                play(vodItemToChannel(vodMatch));
                return;
            }

            if (isKanChannel(ch)) {
                const cacheKey = vodMatchCacheKey(program);
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

        const cacheKey = `${channel.id}:${program.start}:${program.end}:${programName}`;
        const cached = vodAvailabilityCacheRef.current.get(cacheKey);
        if (cached !== undefined) return cached;

        const hasVod = Boolean(findVodMatchForProgram(program, channel, vodRecentItems));
        vodAvailabilityCacheRef.current.set(cacheKey, hasVod);
        return hasVod;
    }, [vodRecentItems]);

    const handleChannelClick = useCallback((ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const refreshNow = useCallback(() => {
        refresh();
        if (!guideRange) return;
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
                        guideStartSec={guideRange?.start}
                        guideEndSec={guideRange?.end}
                        onGuideRangeChange={handleGuideRangeChange}
                    />
                </div>
            </main>
        </div>
    );
}
