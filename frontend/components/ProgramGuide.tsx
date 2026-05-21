"use client";

import { memo, useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Clock3, ListVideo, Play } from "lucide-react";
import { Channel, Program } from "@/lib/channels-data";
import { useNowSec } from "@/hooks/use-now-sec";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProgramGuideProps {
    channels: Channel[];
    sourceChannels?: Channel[];
    logoBasePath?: string;
    playingChannelId?: string | null;
    playingChannelIndex?: number | null;
    onChannelClick?: (channel: Channel) => void;
    onProgramClick?: (program: Program, channel: Channel, isLive: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_W = 200;       // px per hour
const CELL_H = 60;        // px per channel row
const CHAN_W = "var(--guide-channel-width, 130px)"; // channel column width
const HEAD_H = 48;        // header height
const SECS_PER_HOUR = 3600;
const PX_PER_SEC = CELL_W / SECS_PER_HOUR;
const HOURS_BACK = 1;
const HOURS_FORWARD = 12;
const DEFAULT_CHANNEL_W = 130;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
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

    return groups;
}

function getSourceLabel(channel: Channel, sourceIndex: number): string {
    const backupMatch = channel.name.match(/גיבוי\s*\d*/);

    if (backupMatch?.[0]) {
        return backupMatch[0].trim();
    }

    return sourceIndex === 0 ? "ראשי" : `מקור ${sourceIndex + 1}`;
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
    isPlayingProgram,
    onClick,
    didDrag,
}: {
    program: Program;
    channel: Channel;
    guideStart: number;
    guideEnd: number;
    nowSec: number;
    isPlayingProgram: boolean;
    onClick?: (p: Program, ch: Channel, isLive: boolean) => void;
    didDrag: React.MutableRefObject<boolean>;
}) {
    const [hovered, setHovered] = useState(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    // Clamp to visible window
    const visStart = Math.max(program.start, guideStart);
    const visEnd = Math.min(program.end, guideEnd);
    if (visEnd <= visStart) return null;

    const width = Math.max((visEnd - visStart) * PX_PER_SEC - 3, 20);
    // RTL: right = distance from right edge of grid
    const right = (guideEnd - visEnd) * PX_PER_SEC;

    //const now = Math.floor(Date.now() / 1000);
    //const isLive = now >= program.start && now < program.end;
    const isLive = isProgramLive(program, nowSec);

    return (
        <div
            className={`
        absolute top-1.5 rounded-lg border px-2 py-1 cursor-pointer select-none
        transition-all duration-150
        ${isPlayingProgram
                    ? "bg-emerald-900/95 border-emerald-300/80 ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-950/60"
                    : isLive
                        ? "bg-primary/20 border-primary/60 shadow-lg shadow-primary/10"
                        : "bg-zinc-800/90 border-zinc-700/50"
                }
        ${hovered ? "brightness-125 z-50 shadow-xl" : ""}
      `}
            style={{ right: right + 2, width, height: CELL_H - 12 }}
            onMouseEnter={() => {
                hoverTimerRef.current = setTimeout(() => setHovered(true), 1000);
            }}
            onMouseLeave={() => {
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                setHovered(false);
            }}
            onClick={(e) => {
                if (didDrag.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                onClick?.(program, channel, isLive)
            }}
            aria-current={isPlayingProgram ? "true" : undefined}
        >
            <div className="flex items-start gap-1 h-full overflow-hidden">
                {isPlayingProgram ? (
                    <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                        <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                    </span>
                ) : isLive && (
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                )}
                <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate leading-tight">{program.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                        {formatTime(program.start)} – {formatTime(program.end)}
                    </p>
                </div>
            </div>

            {hovered && (
                <div
                    dir="rtl"
                    className="pointer-events-none absolute right-0 top-full z-[200] mt-2 w-72 max-w-[min(18rem,80vw)] rounded-lg border border-primary/35 bg-popover/98 p-3 text-right shadow-2xl shadow-black/35 ring-1 ring-white/5"
                    role="tooltip"
                >
                    <div className="mb-2 flex items-start justify-between gap-3 border-b border-border/70 pb-2">
                        <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-bold leading-5 text-foreground">{program.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {formatTime(program.start)} - {formatTime(program.end)}
                            </p>
                        </div>
                        {isLive && (
                            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                                עכשיו
                            </span>
                        )}
                    </div>
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                        {program.description || "אין תיאור זמין לתוכנית הזו."}
                    </p>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    return (
        prev.program === next.program &&
        prev.channel === next.channel &&
        prev.guideStart === next.guideStart &&
        prev.guideEnd === next.guideEnd &&
        prev.isPlayingProgram === next.isPlayingProgram &&
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
    onChannelClick,
    onProgramClick,
}: ProgramGuideProps) {
    // const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
    const mainRef = useRef<HTMLDivElement>(null);

    const isDragging = useRef(false);
    const didDrag = useRef(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const scrollLeftStart = useRef(0);
    const scrollTopStart = useRef(0);

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

    const visibleChannels = useMemo(() => uniqueChannelsByIndex(channels), [channels]);
    const channelsByIndex = useMemo(() => groupChannelsByIndex(sourceChannels), [sourceChannels]);

    // All timestamps in unix seconds
    const { guideStart, guideEnd, totalGridW, totalGridH, totalContentH, hourLabels, nowRight } = useMemo(() => {
        // const nowSec = Math.floor(Date.now() / 1000);

        // Snap guideStart to the beginning of the hour that is HOURS_BACK ago
        const startRaw = nowSec - HOURS_BACK * SECS_PER_HOUR;
        // Snap to whole hour
        const start = Math.floor(startRaw / SECS_PER_HOUR) * SECS_PER_HOUR;
        const end = start + (HOURS_BACK + HOURS_FORWARD) * SECS_PER_HOUR;

        const w = (end - start) * PX_PER_SEC;
        const h = visibleChannels.length * CELL_H;

        // Hour labels: every whole hour between start and end
        const labels: { ts: number; label: string }[] = [];
        for (let ts = start; ts <= end; ts += SECS_PER_HOUR) {
            if (labels.length < (HOURS_BACK + HOURS_FORWARD)) {
                labels.push({
                    ts,
                    label: new Date(ts * 1000).toLocaleTimeString("he-IL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }),
                });
            }
        }

        // nowRight: px from right edge of grid to now line
        const nowRight = Math.round((end - nowSec) * PX_PER_SEC);

        return {
            guideStart: start,
            guideEnd: end,
            totalGridW: w,
            totalGridH: h,
            totalContentH: HEAD_H + h,
            hourLabels: labels,
            nowRight,
        };
    }, [visibleChannels.length, nowSec]);

    // Auto-scroll: position "now" at ~30% from the right on load
    const didScrollRef = useRef(false);
    const mainCallbackRef = useCallback(
        (node: HTMLDivElement | null) => {
            (mainRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (node && !didScrollRef.current) {
                requestAnimationFrame(() => {
                    const visibleW = node.clientWidth;
                    const channelW = getGuideChannelWidth();
                    const visibleProgramW = Math.max(0, visibleW - channelW);
                    const nowX = totalGridW - nowRight;
                    const target = nowX - visibleProgramW * 0.7;
                    const maxScrollLeft = Math.max(0, channelW + totalGridW - visibleW);
                    node.scrollLeft = Math.max(0, Math.min(target, maxScrollLeft));
                    didScrollRef.current = true;
                });
            }
        },
        [nowRight, totalGridW]
    );

    const scrollToNow = useCallback(() => {
        if (!mainRef.current) return;
        const visibleW = mainRef.current.clientWidth;
        const channelW = getGuideChannelWidth();
        const visibleProgramW = Math.max(0, visibleW - channelW);
        const nowX = totalGridW - nowRight;
        const target = nowX - visibleProgramW * 0.7;
        const maxScrollLeft = Math.max(0, channelW + totalGridW - visibleW);
        const clamped = Math.max(0, Math.min(target, maxScrollLeft));
        mainRef.current.scrollTo({ left: clamped, behavior: "smooth" });
    }, [nowRight, totalGridW]);

    return (
        <div className="h-full w-full bg-background flex flex-col font-sans overflow-hidden">
            <div
                ref={mainCallbackRef}
                onMouseDown={onMouseDown}
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
                            {hourLabels.map(({ ts, label }) => {
                                const left = (ts - guideStart) * PX_PER_SEC;

                                return (
                                    <div
                                        key={ts}
                                        className="absolute top-0 flex items-center pr-2 px-2 text-xs font-bold text-zinc-300 tracking-wider border-r border-zinc-800"
                                        style={{ left, width: CELL_W, height: HEAD_H }}
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
                            onClick={scrollToNow}
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
                        {visibleChannels.map((ch) => {
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
                                        guide-channel-cell relative flex items-center gap-2 px-3 border-b border-zinc-800/70
                                        transition-colors cursor-pointer
                                        ${isPlayingChannel
                                            ? "bg-emerald-950/80 shadow-[inset_-3px_0_0_rgb(52_211_153)] hover:bg-emerald-900/70"
                                            : "hover:bg-zinc-800"
                                        }
                                    `}
                                    style={{ height: CELL_H }}
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
                                                : ch.index}
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
                                style={{ right: (guideEnd - ts) * PX_PER_SEC }}
                            />
                        ))}

                        {visibleChannels.map((_, ri) => (
                            <div
                                key={ri}
                                className="absolute left-0 right-0 border-b border-zinc-800/50"
                                style={{ top: ri * CELL_H, height: CELL_H }}
                            />
                        ))}

                        <div
                            className="absolute top-0 bottom-0 z-30 w-0.5 bg-primary/85 pointer-events-none"
                            style={{ right: `${nowRight}px` }}
                        />

                        {visibleChannels.map((ch, ri) => {
                            const isPlayingChannel =
                                ch.id === playingChannelId ||
                                ch.index === playingChannelIndex;

                            return (
                                <div
                                    key={ch.id}
                                    className="absolute left-0 right-0"
                                    style={{ top: ri * CELL_H, height: CELL_H }}
                                >
                                    {isPlayingChannel && (
                                        <div
                                            className="absolute inset-x-0 top-0 border-y border-emerald-400/20 bg-emerald-950/30 pointer-events-none"
                                            style={{ height: CELL_H }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {ch.programs.length === 0 ? (
                                        <div
                                            className="absolute top-1.5 inset-x-2 rounded-lg border border-zinc-800/40 bg-zinc-900/50 flex items-center pr-3"
                                            style={{ height: CELL_H - 12 }}
                                        >
                                            <span className="text-xs text-zinc-600">אין מידע</span>
                                        </div>
                                    ) : (
                                        ch.programs.map((prog, pi) => (
                                            <ProgramCell
                                                key={pi}
                                                program={prog}
                                                channel={ch}
                                                guideStart={guideStart}
                                                guideEnd={guideEnd}
                                                nowSec={nowSec}
                                                isPlayingProgram={isPlayingChannel && isProgramLive(prog, nowSec)}
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
