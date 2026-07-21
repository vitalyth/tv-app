"use client";

import { memo, useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Clock3, ListVideo, Play, Video } from "lucide-react";
import { Channel, Program } from "@/lib/channels-data";
import { CHANNEL_REGION_SECTIONS, getChannelRegion } from "@/lib/channel-regions";
import { useNowSec } from "@/hooks/use-now-sec";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProgramGuideProps {
    channels: Channel[];
    sourceChannels?: Channel[];
    logoBasePath?: string;
    playingChannelId?: string | null;
    playingChannelIndex?: number | null;
    selectedProgram?: { program: Program; channel: Channel } | null;
    onChannelClick?: (channel: Channel) => void;
    onProgramClick?: (program: Program, channel: Channel, isLive: boolean) => void;
    hasVodForProgram?: (program: Program, channel: Channel) => boolean;
    guideStartSec?: number;
    guideEndSec?: number;
    onGuideRangeChange?: (range: { start: number; end: number }) => void;
}

type GuideRow =
    | { type: "section"; key: string; label: string; count: number }
    | { type: "channel"; key: string; channel: Channel };

type PositionedGuideRow = GuideRow & {
    top: number;
    height: number;
};

type VisibleViewport = {
    top: number;
    height: number;
};

type VisibleTimeRange = {
    start: number;
    end: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_W = 180;       // px per hour
const CELL_H = 72;        // px per channel row
const SECTION_H = 34;     // px per channel group header
const CHAN_W = "var(--guide-channel-width, 130px)"; // channel column width
const HEAD_H = 48;        // header height
const SECS_PER_HOUR = 3600;
const PX_PER_SEC = CELL_W / SECS_PER_HOUR;
const HOURS_BACK = 1;
const HOURS_FORWARD = 9;
const INITIAL_LOAD_BUFFER_HOURS = 2;
const DEFAULT_CHANNEL_W = 130;
const LAZY_EDGE_THRESHOLD = 260;
const LAZY_EXPAND_HOURS = 12;
const MAX_HOURS_BACK = 24;
const MAX_HOURS_FORWARD = 48;
const ROW_OVERSCAN_PX = CELL_H * 4;
const TIME_OVERSCAN_HOURS = 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
}

function formatTimeRange(start: number, end: number): string {
    return `${formatTime(start)} - ${formatTime(end)}`;
}

function uniqueChannelsByIndex(channels: Channel[]): Channel[] {
    const seen = new Set<number>();

    return channels.filter((channel) => {
        if (seen.has(channel.index)) {
            return false;
        }

        seen.add(channel.index);
        return true;
    });
}

function groupChannelsByIndex(channels: Channel[]): Map<number, Channel[]> {
    const groups = new Map<number, Channel[]>();

    channels.forEach((channel) => {
        const group = groups.get(channel.index);

        if (group) {
            group.push(channel);
            return;
        }

        groups.set(channel.index, [channel]);
    });

    const sourceOrder = new Map([
        ["ch_11", 0],
        ["ch_11b", 1],
        ["ch_11d", 2],
        ["ch_11c", 3],
    ]);

    groups.forEach((group) => {
        group.sort((a, b) => {
            const aOrder = sourceOrder.get(a.id) ?? sourceOrder.get(a.channelID) ?? 100;
            const bOrder = sourceOrder.get(b.id) ?? sourceOrder.get(b.channelID) ?? 100;
            return aOrder - bOrder;
        });
    });

    return groups;
}

function getSourceLabel(channel: Channel, sourceIndex: number): string {
    const backupMatch = channel.name.match(/גיבוי\s*\d*/);

    if (backupMatch?.[0]) {
        return backupMatch[0].trim();
    }

    return sourceIndex === 0 ? "ראשי" : `מקור ${sourceIndex + 1}`;
}

function getChannelDisplayNumber(channel: Channel): string | number {
    return channel.channelNumber || channel.index;
}

function getProgramSelectionKey(program: Program, channel: Channel): string {
    return `${channel.id}:${program.start}:${program.end}:${program.name}`;
}

function getGuideChannelWidth(): number {
    if (typeof window === "undefined") {
        return DEFAULT_CHANNEL_W;
    }

    const rawValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--guide-channel-width")
        .trim();
    const parsed = Number.parseFloat(rawValue);

    return Number.isFinite(parsed) ? parsed : DEFAULT_CHANNEL_W;
}

function formatGuideDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString("he-IL", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
    });
}

function resolveProgramImage(program: Program): string {
    const image = program.image || "";

    if (!image) {
        return "";
    }

    if (image.startsWith("http://") || image.startsWith("https://")) {
        return image;
    }

    if (image.startsWith("//")) {
        return `https:${image}`;
    }

    if (image.startsWith("/")) {
        return image;
    }

    return image;
}

// ─── Program Cell ─────────────────────────────────────────────────────────────

function isProgramLive(program: Program, nowSec: number): boolean {
    return nowSec >= program.start && nowSec < program.end;
}

const ProgramCell = memo(function ProgramCell({
    program,
    channel,
    guideStart,  // unix seconds
    guideEnd,    // unix seconds
    nowSec,
    pxPerSec,
    isPlayingProgram,
    isSelectedProgram,
    hasVod,
    enableTooltip,
    onClick,
    didDrag,
}: {
    program: Program;
    channel: Channel;
    guideStart: number;
    guideEnd: number;
    nowSec: number;
    pxPerSec: number;
    isPlayingProgram: boolean;
    isSelectedProgram: boolean;
    hasVod: boolean;
    enableTooltip: boolean;
    onClick?: (p: Program, ch: Channel, isLive: boolean) => void;
    didDrag: React.MutableRefObject<boolean>;
}) {
    // Clamp to visible window
    const visStart = Math.max(program.start, guideStart);
    const visEnd = Math.min(program.end, guideEnd);
    if (visEnd <= visStart) return null;

    const width = Math.max((visEnd - visStart) * pxPerSec - 3, 20);
    // RTL: right = distance from right edge of grid
    const right = (guideEnd - visEnd) * pxPerSec;

    //const now = Math.floor(Date.now() / 1000);
    //const isLive = now >= program.start && now < program.end;
    const isLive = isProgramLive(program, nowSec);
    const programImage = resolveProgramImage(program);
    const showInlineImage = Boolean(programImage && width >= 76);
    const leadingOffsetClass = showInlineImage ? "pl-16" : "";

    const cell = (
        <div
            className={`
        absolute top-1.5 rounded-lg border cursor-pointer select-none overflow-hidden
        transition-colors duration-150 hover:brightness-125 hover:z-50 hover:shadow-xl focus-visible:brightness-125 focus-visible:z-50 focus-visible:shadow-xl
        ${isPlayingProgram
                    ? "bg-emerald-900/95 border-emerald-300/80 ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-950/60"
                    : isSelectedProgram
                        ? "bg-cyan-950/80 border-cyan-300/80 ring-2 ring-cyan-300/60 shadow-lg shadow-cyan-950/50"
                    : isLive
                        ? "bg-primary/20 border-primary/60 shadow-lg shadow-primary/10"
                        : "bg-zinc-800/90 border-zinc-700/50"
                }
            `}
            style={{ right: right + 2, width, height: CELL_H - 12, contain: "layout paint style" }}
            onClick={(e) => {
                if (didDrag.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                onClick?.(program, channel, isLive)
            }}
            aria-current={isPlayingProgram ? "true" : undefined}
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }

                event.preventDefault();
                onClick?.(program, channel, isLive);
            }}
        >
            {showInlineImage && (
                <div className="absolute left-0 top-0 h-full w-20 overflow-hidden" aria-hidden="true">
                    <img
                        src={programImage}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        style={{
                            WebkitMaskImage: "linear-gradient(to right, black 0%, black 50%, rgb(0 0 0 / 0.55) 72%, rgb(0 0 0 / 0.12) 90%, transparent 100%)",
                            maskImage: "linear-gradient(to right, black 0%, black 50%, rgb(0 0 0 / 0.55) 72%, rgb(0 0 0 / 0.12) 90%, transparent 100%)",
                        }}
                        onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                </div>
            )}
            <div className={`flex h-full flex-row-reverse items-start gap-1.5 overflow-hidden px-2 py-1 text-right ${leadingOffsetClass}`}>
                {isPlayingProgram ? (
                    <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                        <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                    </span>
                ) : isLive && (
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                )}
                {hasVod && !isLive && !isPlayingProgram && (
                    <span
                        className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-200/35"
                        title="זמין ב-VOD"
                        aria-label="זמין ב-VOD"
                    >
                        <Video className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                )}
                <div className="min-w-0 flex-1 overflow-hidden" dir="rtl">
                    <p className="text-xs font-semibold text-white truncate leading-tight">{program.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate" dir="ltr">
                        {formatTimeRange(program.start, program.end)}
                    </p>
                </div>
            </div>
        </div>
    );

    if (!enableTooltip) {
        return cell;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {cell}
            </TooltipTrigger>
            <TooltipContent
                dir="rtl"
                side="top"
                align="center"
                sideOffset={8}
                collisionPadding={12}
                hideArrow
                className="z-[130] w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-cyan-300/45 bg-zinc-950/95 p-3.5 text-right text-zinc-300 shadow-[0_18px_42px_rgba(0,0,0,0.55)] ring-1 ring-white/5 backdrop-blur-md"
            >
                <div className="text-sm font-bold leading-tight text-white">{program.name}</div>
                <div dir="rtl" className="mt-1 flex flex-wrap items-center justify-start gap-1.5 text-right text-[11px] text-zinc-400">
                    <span dir="ltr" className="text-right">{formatTimeRange(program.start, program.end)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{channel.name}</span>
                </div>
                {program.description && (
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-300">
                        {program.description}
                    </p>
                )}
            </TooltipContent>
        </Tooltip>
    );
}, (prev, next) => {
    return (
        prev.program === next.program &&
        prev.channel === next.channel &&
        prev.guideStart === next.guideStart &&
        prev.guideEnd === next.guideEnd &&
        prev.pxPerSec === next.pxPerSec &&
        prev.isPlayingProgram === next.isPlayingProgram &&
        prev.isSelectedProgram === next.isSelectedProgram &&
        prev.hasVod === next.hasVod &&
        prev.enableTooltip === next.enableTooltip &&
        prev.onClick === next.onClick &&
        prev.didDrag === next.didDrag &&
        isProgramLive(prev.program, prev.nowSec) === isProgramLive(next.program, next.nowSec)
    );
});

// ─── Main Component ───────────────────────────────────────────────────────────

function ProgramGuide({
    channels,
    sourceChannels = channels,
    logoBasePath = "/",
    playingChannelId,
    playingChannelIndex,
    selectedProgram,
    onChannelClick,
    onProgramClick,
    hasVodForProgram,
    guideStartSec,
    guideEndSec,
    onGuideRangeChange,
}: ProgramGuideProps) {
    // const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
    const mainRef = useRef<HTMLDivElement>(null);

    const isDragging = useRef(false);
    const didDrag = useRef(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const scrollLeftStart = useRef(0);
    const scrollTopStart = useRef(0);
    const previousGuideStartRef = useRef<number | null>(null);
    const lastRangeRequestRef = useRef<string | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastGuideSizeRef = useRef<{ width: number; height: number } | null>(null);
    const maybeLoadMoreForScrollRef = useRef<(() => void) | null>(null);
    const previousNowSecRef = useRef<number | null>(null);
    const [visibleDateLabel, setVisibleDateLabel] = useState(() => formatGuideDate(Date.now() / 1000));
    const lastVisibleDateLabelRef = useRef(visibleDateLabel);
    const [visibleViewport, setVisibleViewport] = useState<VisibleViewport>({ top: 0, height: 900 });
    const [visibleTimeRange, setVisibleTimeRange] = useState<VisibleTimeRange | null>(null);
    const [enableProgramTooltip, setEnableProgramTooltip] = useState(false);

    /*
    useEffect(() => {
      const interval = setInterval(() => {
        setNowSec(Math.floor(Date.now() / 1000));
      }, 1000);
  
      return () => clearInterval(interval);
    }, []);
    */

    const onMouseDown = (e: React.MouseEvent) => {
        if (!mainRef.current) return;

        isDragging.current = true;
        didDrag.current = false;

        startX.current = e.clientX;
        startY.current = e.clientY;

        scrollLeftStart.current = mainRef.current.scrollLeft;
        scrollTopStart.current = mainRef.current.scrollTop;

        document.body.style.userSelect = "none";
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !mainRef.current) return;

        const dx = e.clientX - startX.current;
        const dy = e.clientY - startY.current;

        // 👇 THIS is what fixes your issue
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            didDrag.current = true;
        }

        mainRef.current.scrollLeft = scrollLeftStart.current - dx;
        mainRef.current.scrollTop = scrollTopStart.current - dy;
    };

    const onMouseUp = () => {
        isDragging.current = false;

        // 👇 IMPORTANT: reset AFTER click cycle
        setTimeout(() => {
            didDrag.current = false;
        }, 0);

        document.body.style.userSelect = "";
    };

    useEffect(() => {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    const nowSec = useNowSec();
    const nowSecRef = useRef(nowSec);
    const cellW = CELL_W;
    const pxPerSec = PX_PER_SEC;

    useEffect(() => {
        nowSecRef.current = nowSec;
    }, [nowSec]);

    const visibleChannels = useMemo(() => uniqueChannelsByIndex(channels), [channels]);
    const channelsByIndex = useMemo(() => groupChannelsByIndex(sourceChannels), [sourceChannels]);
    const selectedProgramKey = useMemo(() => (
        selectedProgram
            ? getProgramSelectionKey(selectedProgram.program, selectedProgram.channel)
            : null
    ), [selectedProgram]);
    const guideRows = useMemo<PositionedGuideRow[]>(() => {
        let top = 0;
        const rows: PositionedGuideRow[] = [];

        CHANNEL_REGION_SECTIONS.forEach((section) => {
            const sectionChannels = visibleChannels.filter(
                (channel) => getChannelRegion(channel) === section.value
            );

            if (sectionChannels.length === 0) {
                return;
            }

            rows.push({
                type: "section",
                key: `section-${section.value}`,
                label: section.label,
                count: sectionChannels.length,
                top,
                height: SECTION_H,
            });
            top += SECTION_H;

            sectionChannels.forEach((channel) => {
                rows.push({
                    type: "channel",
                    key: channel.id,
                    channel,
                    top,
                    height: CELL_H,
                });
                top += CELL_H;
            });
        });

        return rows;
    }, [visibleChannels]);

    // All timestamps in unix seconds
    const { guideStart, guideEnd, totalGridW, totalGridH, totalContentH, hourLabels, nowRight } = useMemo(() => {
        const fallbackStart = Math.floor(
            (nowSec - HOURS_BACK * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const fallbackEnd = fallbackStart + (HOURS_BACK + HOURS_FORWARD) * SECS_PER_HOUR;
        const start = guideStartSec ?? fallbackStart;
        const end = guideEndSec ?? fallbackEnd;

        const w = (end - start) * pxPerSec;
        const h = guideRows.reduce((height, row) => height + row.height, 0);

        // Hour labels: every whole hour between start and end
        const labels: { ts: number; label: string }[] = [];
        for (let ts = start; ts < end; ts += SECS_PER_HOUR) {
            const date = new Date(ts * 1000);
            const timeLabel = date.toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            });

            labels.push({
                ts,
                label: timeLabel,
            });
        }

        // nowRight: px from right edge of grid to now line
        const nowRight = Math.round((end - nowSec) * pxPerSec);

        return {
            guideStart: start,
            guideEnd: end,
            totalGridW: w,
            totalGridH: h,
            totalContentH: HEAD_H + h,
            hourLabels: labels,
            nowRight,
        };
    }, [guideEndSec, guideRows, guideStartSec, nowSec, pxPerSec]);

    const visibleGuideRows = useMemo(() => {
        const visibleTop = visibleViewport.top;
        const visibleBottom = visibleTop + visibleViewport.height;

        return guideRows.filter((row) => row.top + row.height >= visibleTop && row.top <= visibleBottom);
    }, [guideRows, visibleViewport]);
    const visibleProgramsByChannelId = useMemo(() => {
        const programsByChannelId = new Map<string, Program[]>();

        visibleGuideRows.forEach((row) => {
            if (row.type === "section") {
                return;
            }

            programsByChannelId.set(
                row.channel.id,
                row.channel.programs.filter((program) =>
                    program.end > (visibleTimeRange?.start ?? guideStart) &&
                    program.start < (visibleTimeRange?.end ?? guideEnd)
                )
            );
        });

        return programsByChannelId;
    }, [guideEnd, guideStart, visibleGuideRows, visibleTimeRange]);

    const updateVisibleDateLabel = useCallback(() => {
        if (!mainRef.current) {
            const fallbackLabel = formatGuideDate(guideStart);
            if (lastVisibleDateLabelRef.current !== fallbackLabel) {
                lastVisibleDateLabelRef.current = fallbackLabel;
                setVisibleDateLabel(fallbackLabel);
            }
            return;
        }

        const channelW = getGuideChannelWidth();
        const visibleProgramLeft = Math.max(0, mainRef.current.scrollLeft - channelW);
        const visibleTs = guideStart + Math.round(visibleProgramLeft / pxPerSec);
        const nextLabel = formatGuideDate(visibleTs);

        if (lastVisibleDateLabelRef.current !== nextLabel) {
            lastVisibleDateLabelRef.current = nextLabel;
            setVisibleDateLabel(nextLabel);
        }
    }, [guideStart, pxPerSec]);

    const updateVisibleViewport = useCallback(() => {
        const node = mainRef.current;
        if (!node) return;

        const channelW = getGuideChannelWidth();
        const nextTop = Math.max(0, node.scrollTop - HEAD_H - ROW_OVERSCAN_PX);
        const nextHeight = node.clientHeight + ROW_OVERSCAN_PX * 2;
        const visibleProgramLeft = Math.max(0, node.scrollLeft - channelW);
        const visibleProgramW = Math.max(cellW, node.clientWidth - channelW);
        const timeOverscan = TIME_OVERSCAN_HOURS * SECS_PER_HOUR;
        const nextTimeStart = Math.max(
            guideStart,
            Math.floor(guideStart + visibleProgramLeft / pxPerSec - timeOverscan)
        );
        const nextTimeEnd = Math.min(
            guideEnd,
            Math.ceil(guideStart + (visibleProgramLeft + visibleProgramW) / pxPerSec + timeOverscan)
        );

        setVisibleViewport((previous) => {
            if (
                Math.abs(previous.top - nextTop) < CELL_H / 2 &&
                Math.abs(previous.height - nextHeight) < CELL_H / 2
            ) {
                return previous;
            }

            return { top: nextTop, height: nextHeight };
        });

        setVisibleTimeRange((previous) => {
            if (
                previous &&
                Math.abs(previous.start - nextTimeStart) < SECS_PER_HOUR / 2 &&
                Math.abs(previous.end - nextTimeEnd) < SECS_PER_HOUR / 2
            ) {
                return previous;
            }

            return { start: nextTimeStart, end: nextTimeEnd };
        });
    }, [cellW, guideEnd, guideStart, pxPerSec]);

    const scheduleViewportUpdate = useCallback(() => {
        if (scrollFrameRef.current !== null) return;

        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            updateVisibleViewport();
            updateVisibleDateLabel();
            maybeLoadMoreForScrollRef.current?.();
        });
    }, [updateVisibleDateLabel, updateVisibleViewport]);

    useEffect(() => {
        const previousGuideStart = previousGuideStartRef.current;

        if (previousGuideStart !== null && guideStart < previousGuideStart && mainRef.current) {
            const addedWidth = (previousGuideStart - guideStart) * pxPerSec;
            mainRef.current.scrollLeft += addedWidth;
        }

        previousGuideStartRef.current = guideStart;
        lastRangeRequestRef.current = `${guideStart}:${guideEnd}`;
        const frame = requestAnimationFrame(() => {
            updateVisibleViewport();
            updateVisibleDateLabel();
        });

        return () => cancelAnimationFrame(frame);
    }, [guideEnd, guideStart, pxPerSec, updateVisibleDateLabel, updateVisibleViewport]);

    const requestGuideRange = useCallback(
        (range: { start: number; end: number }) => {
            if (!onGuideRangeChange) return;

            const key = `${range.start}:${range.end}`;
            if (lastRangeRequestRef.current === key) return;

            lastRangeRequestRef.current = key;
            onGuideRangeChange(range);
        },
        [onGuideRangeChange]
    );

    const requestBufferedVisibleRange = useCallback((node: HTMLDivElement) => {
        if (!onGuideRangeChange) return;

        const channelW = getGuideChannelWidth();
        const visibleProgramW = Math.max(cellW, node.clientWidth - channelW);
        const visibleProgramSeconds = Math.ceil(visibleProgramW / pxPerSec);
        const currentNowSec = nowSecRef.current;
        const visibleStart = Math.floor(
            (currentNowSec - HOURS_BACK * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const visibleEnd = visibleStart + visibleProgramSeconds;
        const bufferSeconds = INITIAL_LOAD_BUFFER_HOURS * SECS_PER_HOUR;

        requestGuideRange({
            start: Math.floor((visibleStart - bufferSeconds) / SECS_PER_HOUR) * SECS_PER_HOUR,
            end: Math.ceil((visibleEnd + bufferSeconds) / SECS_PER_HOUR) * SECS_PER_HOUR,
        });
    }, [cellW, onGuideRangeChange, pxPerSec, requestGuideRange]);

    const runGuideResizeUpdate = useCallback(() => {
        const node = mainRef.current;
        if (!node) return;

        updateVisibleViewport();
        updateVisibleDateLabel();
        requestBufferedVisibleRange(node);
    }, [requestBufferedVisibleRange, updateVisibleDateLabel, updateVisibleViewport]);

    const handleGuideResize = useCallback(() => {
        const node = mainRef.current;
        if (!node) return;

        const nextSize = {
            width: Math.round(node.clientWidth),
            height: Math.round(node.clientHeight),
        };
        const previousSize = lastGuideSizeRef.current;

        if (
            previousSize &&
            Math.abs(previousSize.width - nextSize.width) < 8 &&
            Math.abs(previousSize.height - nextSize.height) < 8
        ) {
            return;
        }

        lastGuideSizeRef.current = nextSize;

        if (resizeTimeoutRef.current !== null) {
            clearTimeout(resizeTimeoutRef.current);
        }

        resizeTimeoutRef.current = setTimeout(() => {
            resizeTimeoutRef.current = null;
            runGuideResizeUpdate();
        }, 120);
    }, [runGuideResizeUpdate]);

    const maybeLoadMoreForScroll = useCallback(() => {
        if (!mainRef.current || !onGuideRangeChange) return;

        const node = mainRef.current;
        const minStart = Math.floor(
            (nowSec - MAX_HOURS_BACK * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const maxEnd = Math.ceil(
            (nowSec + MAX_HOURS_FORWARD * SECS_PER_HOUR) / SECS_PER_HOUR
        ) * SECS_PER_HOUR;
        const expandBy = LAZY_EXPAND_HOURS * SECS_PER_HOUR;
        const nearLeft = node.scrollLeft <= LAZY_EDGE_THRESHOLD;
        const nearRight = node.scrollLeft + node.clientWidth >= node.scrollWidth - LAZY_EDGE_THRESHOLD;

        if (nearLeft && guideStart > minStart) {
            requestGuideRange({
                start: Math.max(minStart, guideStart - expandBy),
                end: guideEnd,
            });
            return;
        }

        if (nearRight && guideEnd < maxEnd) {
            requestGuideRange({
                start: guideStart,
                end: Math.min(maxEnd, guideEnd + expandBy),
            });
        }
    }, [guideEnd, guideStart, nowSec, onGuideRangeChange, requestGuideRange]);

    useEffect(() => {
        maybeLoadMoreForScrollRef.current = maybeLoadMoreForScroll;
    }, [maybeLoadMoreForScroll]);

    const handleGuideScroll = useCallback(() => {
        scheduleViewportUpdate();
    }, [scheduleViewportUpdate]);

    useEffect(() => {
        const media = window.matchMedia("(hover: hover) and (pointer: fine)");
        const update = () => setEnableProgramTooltip(media.matches);

        update();
        media.addEventListener("change", update);

        return () => media.removeEventListener("change", update);
    }, []);

    // Auto-scroll: load the wider range, but initially show one hour before now.
    const didScrollRef = useRef(false);
    const mainCallbackRef = useCallback(
        (node: HTMLDivElement | null) => {
            lastGuideSizeRef.current = null;
            (mainRef as React.MutableRefObject<HTMLDivElement | null>).current = node;

            if (node) {
                runGuideResizeUpdate();
            }
        },
        [runGuideResizeUpdate]
    );

    useEffect(() => {
        window.addEventListener("resize", handleGuideResize);

        return () => {
            window.removeEventListener("resize", handleGuideResize);
            if (resizeTimeoutRef.current !== null) {
                clearTimeout(resizeTimeoutRef.current);
                resizeTimeoutRef.current = null;
            }
            if (scrollFrameRef.current !== null) {
                cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!mainRef.current || didScrollRef.current || totalGridW <= 0) return;

        const frame = requestAnimationFrame(() => {
            const node = mainRef.current;
            if (!node || didScrollRef.current) return;

            const channelW = getGuideChannelWidth();
            const nowX = totalGridW - nowRight;
            const target = nowX - cellW;
            const visibleW = node.clientWidth;
            const maxScrollLeft = Math.max(0, channelW + totalGridW - visibleW);

            node.scrollLeft = Math.max(0, Math.min(target, maxScrollLeft));
            didScrollRef.current = true;
            updateVisibleViewport();
            updateVisibleDateLabel();
        });

        return () => cancelAnimationFrame(frame);
    }, [cellW, nowRight, totalGridW, updateVisibleDateLabel, updateVisibleViewport]);

    const scrollToNow = useCallback((behavior: ScrollBehavior = "smooth") => {
        if (!mainRef.current) return;
        const visibleW = mainRef.current.clientWidth;
        const channelW = getGuideChannelWidth();
        const nowX = totalGridW - nowRight;
        const target = nowX - cellW;
        const maxScrollLeft = Math.max(0, channelW + totalGridW - visibleW);
        const clamped = Math.max(0, Math.min(target, maxScrollLeft));
        mainRef.current.scrollTo({ left: clamped, behavior });
    }, [cellW, nowRight, totalGridW]);

    useEffect(() => {
        const previousNowSec = previousNowSecRef.current;
        previousNowSecRef.current = nowSec;

        if (previousNowSec === null || !mainRef.current || !didScrollRef.current || totalGridW <= 0) {
            return;
        }

        const deltaSeconds = nowSec - previousNowSec;
        if (deltaSeconds <= 0 || deltaSeconds > SECS_PER_HOUR) {
            return;
        }

        const node = mainRef.current;
        const channelW = getGuideChannelWidth();
        const previousNowX = (previousNowSec - guideStart) * pxPerSec;
        const visibleProgramLeft = Math.max(0, node.scrollLeft - channelW);
        const visibleProgramW = Math.max(cellW, node.clientWidth - channelW);
        const nowWasVisible =
            previousNowX >= visibleProgramLeft - 2 &&
            previousNowX <= visibleProgramLeft + visibleProgramW + 2;

        if (!nowWasVisible) {
            return;
        }

        const deltaPx = deltaSeconds * pxPerSec;
        const maxScrollLeft = Math.max(0, channelW + totalGridW - node.clientWidth);
        node.scrollLeft = Math.max(0, Math.min(node.scrollLeft + deltaPx, maxScrollLeft));
        scheduleViewportUpdate();
    }, [cellW, guideStart, nowSec, pxPerSec, scheduleViewportUpdate, totalGridW]);

    return (
        <div className="h-full w-full bg-background flex flex-col font-sans overflow-hidden">
            <div
                ref={mainCallbackRef}
                onMouseDown={onMouseDown}
                onScroll={handleGuideScroll}
                className="flex-1 overflow-scroll cursor-grab active:cursor-grabbing"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--primary) transparent" }}
            >
                <div
                    className="relative"
                    style={{
                        width: `calc(${CHAN_W} + ${totalGridW}px)`,
                        height: totalContentH,
                    }}
                >
                    {/* Header */}
                    <div
                        className="sticky top-0 z-[60] bg-zinc-900"
                        style={{
                            width: `calc(${CHAN_W} + ${totalGridW}px)`,
                            height: HEAD_H,
                        }}
                    >
                        <div
                            className="absolute top-0 z-20 border-b border-zinc-700 bg-zinc-900"
                            style={{ left: CHAN_W, width: totalGridW, height: HEAD_H }}
                        >
                            <div
                                dir="rtl"
                                className="sticky left-0 top-0 z-20 flex h-5 w-screen items-center justify-center border-b border-zinc-800 bg-zinc-900/95 text-[11px] font-bold text-zinc-200"
                                aria-live="polite"
                            >
                                {visibleDateLabel}
                            </div>
                            {hourLabels.map(({ ts, label }) => {
                                const left = (ts - guideStart) * pxPerSec;

                                return (
                                    <div
                                        key={ts}
                                        className="absolute top-5 flex items-center pr-2 px-2 text-xs font-bold text-zinc-300 tracking-wider border-r border-zinc-800"
                                        style={{ left, width: cellW, height: HEAD_H - 20 }}
                                    >
                                        {label}
                                    </div>
                                );
                            })}
                        </div>

                        <div
                            className="absolute bottom-0 z-30 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-background shadow-md shadow-primary/20 pointer-events-none"
                            style={{
                                right: `${nowRight}px`,
                                transform: "translate(50%, 50%)",
                            }}
                        >
                            <span>{formatTime(nowSec)}</span>
                        </div>
                    </div>

                    <div
                        className="sticky left-0 top-0 z-[90] flex items-center justify-between border-b border-r border-zinc-700 bg-zinc-900 px-2"
                        style={{
                            width: CHAN_W,
                            height: HEAD_H,
                            marginTop: -HEAD_H,
                        }}
                    >
                        <button
                            onClick={() => scrollToNow()}
                            className="guide-now-button rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-background transition-colors hover:bg-accent"
                            aria-label="עכשיו"
                        >
                            <Clock3 className="guide-now-icon hidden h-4 w-4" aria-hidden="true" />
                            <span className="guide-now-text">▶ עכשיו</span>
                        </button>
                        <span className="guide-channel-heading text-xs text-zinc-500 font-bold">ערוץ</span>
                    </div>

                    {/* Channel column */}
                    <div
                        className="sticky left-0 z-[70] border-r border-zinc-800 bg-zinc-900"
                        style={{ width: CHAN_W, height: totalGridH }}
                    >
                        <div className="relative h-full w-full">
                        {visibleGuideRows.map((row) => {
                            if (row.type === "section") {
                                return (
                                    <div
                                        key={row.key}
                                        className="guide-section-row absolute inset-x-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-3"
                                        style={{ top: row.top, height: row.height }}
                                    >
                                        <span className="truncate text-xs font-bold text-zinc-200">{row.label}</span>
                                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                                            {row.count}
                                        </span>
                                    </div>
                                );
                            }

                            const ch = row.channel;
                            const isPlayingChannel =
                                ch.id === playingChannelId ||
                                ch.index === playingChannelIndex;
                            const sourceOptions = channelsByIndex.get(ch.index) ?? [ch];
                            const hasSourceOptions = sourceOptions.length > 1;
                            const activeSource = sourceOptions.find((source) => source.id === playingChannelId);

                            return (
                                <div
                                    key={ch.id}
                                    className={`
                                        guide-channel-cell absolute inset-x-0 flex items-center gap-2 px-3 border-b border-zinc-800/70
                                        transition-colors cursor-pointer
                                        ${isPlayingChannel
                                            ? "bg-emerald-950/80 shadow-[inset_-3px_0_0_rgb(52_211_153)] hover:bg-emerald-900/70"
                                            : "hover:bg-zinc-800"
                                        }
                                    `}
                                    style={{ top: row.top, height: row.height }}
                                    onClick={() => onChannelClick?.(ch)}
                                    aria-current={isPlayingChannel ? "true" : undefined}
                                >
                                    <div className="guide-channel-logo w-8 h-8 shrink-0 rounded bg-zinc-800 overflow-hidden flex items-center justify-center">
                                        <img
                                            src={`${logoBasePath}${ch.logo}`}
                                            alt={ch.name}
                                            className="w-full h-full object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                    <div className="guide-channel-text overflow-hidden">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {isPlayingChannel && (
                                                <Play className="h-3 w-3 shrink-0 fill-emerald-300 text-emerald-300" aria-hidden="true" />
                                            )}
                                            <p className="text-xs font-semibold text-zinc-100 truncate leading-tight">{ch.name}</p>
                                        </div>
                                        <p className={isPlayingChannel ? "text-[10px] text-emerald-300" : "text-[10px] text-zinc-500"}>
                                            {isPlayingChannel
                                                ? activeSource
                                                    ? getSourceLabel(activeSource, sourceOptions.indexOf(activeSource))
                                                    : "מנגן עכשיו"
                                                : getChannelDisplayNumber(ch)}
                                        </p>
                                    </div>
                                    {hasSourceOptions && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="guide-source-button ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700/70 hover:text-white"
                                                    aria-label="בחר מקור"
                                                    title="בחר מקור"
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <ListVideo className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                side="left"
                                                className="z-[120] min-w-44 border-zinc-700 bg-zinc-900 text-zinc-100"
                                            >
                                                {sourceOptions.map((source) => {
                                                    const isActiveSource = source.id === playingChannelId;

                                                    return (
                                                        <DropdownMenuItem
                                                            key={source.id}
                                                            className="cursor-pointer justify-between text-right focus:bg-zinc-800 focus:text-white"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                onChannelClick?.(source);
                                                            }}
                                                        >
                                                            <span className="truncate">{source.name}</span>
                                                            {isActiveSource && (
                                                                <Play className="h-3.5 w-3.5 fill-emerald-300 text-emerald-300" aria-hidden="true" />
                                                            )}
                                                        </DropdownMenuItem>
                                                    );
                                                })}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    </div>

                    {/* Grid */}
                    <div
                        className="absolute"
                        style={{
                            top: HEAD_H,
                            left: CHAN_W,
                            width: totalGridW,
                            height: totalGridH,
                        }}
                    >
                        {hourLabels.map(({ ts }) => (
                            <div
                                key={ts}
                                className="absolute top-0 bottom-0 border-r border-zinc-800/40"
                                style={{ right: (guideEnd - ts) * pxPerSec }}
                            />
                        ))}

                        {visibleGuideRows.map((row) => (
                            row.type === "section" ? (
                                <div
                                    key={row.key}
                                    className="absolute left-0 right-0 z-10 flex items-center border-b border-zinc-800 bg-zinc-950/85 px-4"
                                    style={{ top: row.top, height: row.height }}
                                >
                                    <span className="text-xs font-bold text-zinc-300">{row.label}</span>
                                </div>
                            ) : (
                                <div
                                    key={row.key}
                                    className="absolute left-0 right-0 border-b border-zinc-800/50"
                                    style={{ top: row.top, height: row.height }}
                                />
                            )
                        ))}

                        <div
                            className="absolute top-0 bottom-0 z-30 w-0.5 bg-primary/85 pointer-events-none"
                            style={{ right: `${nowRight}px` }}
                        />

                        {visibleGuideRows.map((row) => {
                            if (row.type === "section") {
                                return null;
                            }

                            const ch = row.channel;
                            const isPlayingChannel =
                                ch.id === playingChannelId ||
                                ch.index === playingChannelIndex;
                            const visiblePrograms = visibleProgramsByChannelId.get(ch.id) ?? [];

                            return (
                                <div
                                    key={ch.id}
                                    className="absolute left-0 right-0"
                                    style={{ top: row.top, height: row.height }}
                                >
                                    {isPlayingChannel && (
                                        <div
                                            className="absolute inset-x-0 top-0 border-y border-emerald-400/20 bg-emerald-950/30 pointer-events-none"
                                            style={{ height: CELL_H }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {visiblePrograms.length === 0 ? (
                                        <div
                                            className="absolute top-1.5 inset-x-2 rounded-lg border border-zinc-800/40 bg-zinc-900/50 flex items-center pr-3"
                                            style={{ height: CELL_H - 12 }}
                                        >
                                            <span className="text-xs text-zinc-600">אין מידע</span>
                                        </div>
                                    ) : (
                                        visiblePrograms.map((prog) => (
                                            <ProgramCell
                                                key={`${prog.start}:${prog.end}:${prog.name}`}
                                                program={prog}
                                                channel={ch}
                                                guideStart={guideStart}
                                                guideEnd={guideEnd}
                                                nowSec={nowSec}
                                                pxPerSec={pxPerSec}
                                                isPlayingProgram={isPlayingChannel && isProgramLive(prog, nowSec)}
                                                isSelectedProgram={selectedProgramKey === getProgramSelectionKey(prog, ch)}
                                                hasVod={hasVodForProgram?.(prog, ch) ?? false}
                                                enableTooltip={enableProgramTooltip}
                                                onClick={onProgramClick}
                                                didDrag={didDrag}
                                            />
                                        ))
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media (hover: none) and (pointer: coarse) and (orientation: portrait) and (max-width: 499px) {
                    :root {
                        --guide-channel-width: 58px;
                    }

                    .guide-channel-cell {
                        justify-content: center;
                        padding-left: 0.5rem;
                        padding-right: 0.5rem;
                    }

                    .guide-channel-logo {
                        width: 2.25rem;
                        height: 2.25rem;
                    }

                    .guide-channel-text {
                        display: none;
                    }

                    .guide-channel-heading,
                    .guide-now-text {
                        display: none;
                    }

                    .guide-source-button {
                        position: absolute;
                        bottom: 0.125rem;
                        left: 0.125rem;
                        height: 1.25rem;
                        width: 1.25rem;
                        background: rgba(24, 24, 27, 0.85);
                    }

                    .guide-source-button svg {
                        width: 0.75rem;
                        height: 0.75rem;
                    }

                    .guide-now-button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.375rem;
                        margin-left: auto;
                        margin-right: auto;
                    }

                    .guide-now-icon {
                        display: block;
                    }
                }
            `}</style>
        </div>
    );
}

export default memo(ProgramGuide);
