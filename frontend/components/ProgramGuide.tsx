"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Channel, Program } from "@/lib/channels-data";
import { useNowSec } from "@/hooks/use-now-sec";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProgramGuideProps {
    channels: Channel[];
    logoBasePath?: string;
    onChannelClick?: (channel: Channel) => void;
    onProgramClick?: (program: Program, channel: Channel, isLive: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_W = 200;       // px per hour
const CELL_H = 60;        // px per channel row
const CHAN_W = 130;        // channel column width
const HEAD_H = 48;        // header height
const SECS_PER_HOUR = 3600;
const PX_PER_SEC = CELL_W / SECS_PER_HOUR;
const HOURS_BACK = 1;
const HOURS_FORWARD = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function deduplicateChannels(channels: Channel[]): Channel[] {
    return channels; // for now, we want duplicates to test the UI

    const seen = new Set<number>();
    return channels.filter((ch) => {
        if (seen.has(ch.index)) return false;
        seen.add(ch.index);
        return true;
    });
}

// ─── Program Cell ─────────────────────────────────────────────────────────────

function ProgramCell({
    program,
    channel,
    guideStart,  // unix seconds
    guideEnd,    // unix seconds
    totalGridW,
    nowSec,
    onClick,
    didDrag,
}: {
    program: Program;
    channel: Channel;
    guideStart: number;
    guideEnd: number;
    totalGridW: number;
    nowSec: number;
    onClick?: (p: Program, ch: Channel, isLive: boolean) => void;
    didDrag: React.MutableRefObject<boolean>;
}) {
    const [hovered, setHovered] = useState(false);

    // Clamp to visible window
    const visStart = Math.max(program.start, guideStart);
    const visEnd = Math.min(program.end, guideEnd);
    if (visEnd <= visStart) return null;

    const width = Math.max((visEnd - visStart) * PX_PER_SEC - 3, 20);
    // RTL: right = distance from right edge of grid
    const right = (guideEnd - visEnd) * PX_PER_SEC;

    //const now = Math.floor(Date.now() / 1000);
    //const isLive = now >= program.start && now < program.end;
    const isLive = nowSec >= program.start && nowSec < program.end;

    return (
        <div
            className={`
        absolute top-1.5 rounded-lg border px-2 py-1 cursor-pointer select-none
        transition-all duration-150
        ${isLive
                    ? "bg-blue-900/90 border-blue-400/60 shadow-lg shadow-blue-900/30"
                    : "bg-zinc-800/90 border-zinc-700/50"
                }
        ${hovered ? "brightness-125 z-10 shadow-xl" : ""}
      `}
            style={{ right: right + 2, width, height: CELL_H - 12 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
                if (didDrag.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                onClick?.(program, channel, isLive)
            }}
            title={program.description}
        >
            <div className="flex items-start gap-1 h-full overflow-hidden">
                {isLive && (
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                )}
                <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate leading-tight">{program.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                        {formatTime(program.start)} – {formatTime(program.end)}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProgramGuide({
    channels,
    logoBasePath = "/",
    onChannelClick,
    onProgramClick,
}: ProgramGuideProps) {
    // const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
    const mainRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<HTMLDivElement>(null);
    const sideRef = useRef<HTMLDivElement>(null);

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

        if (headRef.current) headRef.current.scrollLeft = mainRef.current.scrollLeft;
        if (sideRef.current) sideRef.current.scrollTop = mainRef.current.scrollTop;
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

    const onMainScroll = useCallback(() => {
        if (!mainRef.current) return;
        const { scrollLeft, scrollTop } = mainRef.current;
        if (headRef.current) headRef.current.scrollLeft = scrollLeft;
        if (sideRef.current) sideRef.current.scrollTop = scrollTop;
    }, []);
    const onHeadScroll = useCallback(() => {
        if (headRef.current && mainRef.current)
            mainRef.current.scrollLeft = headRef.current.scrollLeft;
    }, []);
    const onSideScroll = useCallback(() => {
        if (sideRef.current && mainRef.current)
            mainRef.current.scrollTop = sideRef.current.scrollTop;
    }, []);

    const dedupedChannels = useMemo(() => deduplicateChannels(channels), [channels]);

    // All timestamps in unix seconds
    const { guideStart, guideEnd, totalGridW, totalGridH, hourLabels, nowRight } = useMemo(() => {
        // const nowSec = Math.floor(Date.now() / 1000);

        // Snap guideStart to the beginning of the hour that is HOURS_BACK ago
        const startRaw = nowSec - HOURS_BACK * SECS_PER_HOUR;
        // Snap to whole hour
        const start = Math.floor(startRaw / SECS_PER_HOUR) * SECS_PER_HOUR;
        const end = start + (HOURS_BACK + HOURS_FORWARD) * SECS_PER_HOUR;

        const w = (end - start) * PX_PER_SEC;
        const h = dedupedChannels.length * CELL_H;

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

        return { guideStart: start, guideEnd: end, totalGridW: w, totalGridH: h, hourLabels: labels, nowRight };
    }, [dedupedChannels.length, nowSec]);

    // Auto-scroll: position "now" at ~30% from the right on load
    const didScrollRef = useRef(false);
    const mainCallbackRef = useCallback(
        (node: HTMLDivElement | null) => {
            (mainRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (node && !didScrollRef.current) {
                requestAnimationFrame(() => {
                    const visibleW = node.clientWidth;
                    // scrollLeft so that nowRight pixels from right = 30% of viewport from right
                    const target = totalGridW - visibleW - nowRight + visibleW * 0.3;
                    node.scrollLeft = Math.max(0, Math.min(target, totalGridW - visibleW));
                    if (headRef.current) headRef.current.scrollLeft = node.scrollLeft;
                    didScrollRef.current = true;
                });
            }
        },
        [nowRight, totalGridW]
    );

    const scrollToNow = useCallback(() => {
        if (!mainRef.current) return;
        const visibleW = mainRef.current.clientWidth;
        const target = totalGridW - visibleW - nowRight + visibleW * 0.3;
        const clamped = Math.max(0, Math.min(target, totalGridW - visibleW));
        mainRef.current.scrollTo({ left: clamped, behavior: "smooth" });
        if (headRef.current) headRef.current.scrollLeft = clamped;
    }, [nowRight, totalGridW]);

    return (
        <div className="h-full w-full bg-zinc-950 flex flex-col font-sans overflow-hidden">
            <div className="flex flex-1 min-h-0">

                {/* ── Channel column (right) ── */}
                <div
                    className="shrink-0 flex flex-col border-r border-zinc-800 z-10 bg-zinc-900"
                    style={{ width: CHAN_W }}
                >
                    {/* Corner */}
                    <div
                        className="shrink-0 flex items-center justify-between px-2 border-b border-zinc-700"
                        style={{ height: HEAD_H }}
                    >
                        <button
                            onClick={scrollToNow}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors"
                        >
                            ▶ עכשיו
                        </button>
                        <span className="text-xs text-zinc-500 font-bold">ערוץ</span>
                    </div>

                    {/* Channel list */}
                    <div
                        ref={sideRef}
                        onScroll={onSideScroll}
                        className="flex-1 overflow-y-scroll overflow-x-hidden"
                        style={{ scrollbarWidth: "none" }}
                    >
                        <div style={{ height: totalGridH }}>
                            {dedupedChannels.map((ch) => (
                                <div
                                    key={ch.id}
                                    className="flex items-center gap-2 px-3 border-b border-zinc-800/70 hover:bg-zinc-800 transition-colors cursor-pointer"
                                    style={{ height: CELL_H }}
                                    onClick={() => onChannelClick?.(ch)}
                                >
                                    <div className="w-8 h-8 shrink-0 rounded bg-zinc-800 overflow-hidden flex items-center justify-center">
                                        <img
                                            src={`${logoBasePath}${ch.logo}`}
                                            alt={ch.name}
                                            className="w-full h-full object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-semibold text-zinc-100 truncate leading-tight">{ch.name}</p>
                                        <p className="text-[10px] text-zinc-500">{ch.index}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Time grid (left, RTL) ── */}
                <div className="flex flex-1 flex-col min-w-0">

                    {/* Header */}
                    <div
                        ref={headRef}
                        onScroll={onHeadScroll}
                        className="shrink-0 overflow-x-scroll overflow-y-hidden border-b border-zinc-700 bg-zinc-900"
                        style={{ height: HEAD_H, scrollbarWidth: "none" }}
                    >
                        <div style={{ width: totalGridW, height: HEAD_H, position: "relative" }}>
                            {hourLabels.map(({ ts, label }) => {
                                // const right = (guideEnd - ts) * PX_PER_SEC;
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
                    </div>

                    {/* Grid */}
                    <div
                        ref={mainCallbackRef}
                        onScroll={onMainScroll}
                        onMouseDown={onMouseDown}
                        className="flex-1 overflow-scroll cursor-grab active:cursor-grabbing"
                        style={{ scrollbarWidth: "thin", scrollbarColor: "#3f3f46 transparent" }}
                    >
                        <div style={{ width: totalGridW, height: totalGridH, position: "relative" }}>

                            {/* Hour lines */}
                            {hourLabels.map(({ ts }) => (
                                <div
                                    key={ts}
                                    className="absolute top-0 bottom-0 border-r border-zinc-800/40"
                                    style={{ right: (guideEnd - ts) * PX_PER_SEC }}
                                />
                            ))}

                            {/* Row dividers */}
                            {dedupedChannels.map((_, ri) => (
                                <div
                                    key={ri}
                                    className="absolute left-0 right-0 border-b border-zinc-800/50"
                                    style={{ top: ri * CELL_H, height: CELL_H }}
                                />
                            ))}

                            {/* Now line */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500/80 z-20 pointer-events-none"
                                style={{ right: `${nowRight}px` }}
                            >
                                <div className="absolute -top-1 -left-2 z-50 translate-x-1/2 w-2.5 h-2.5 rounded-full bg-red-500 shadow-md shadow-red-900" />
                            </div>

                            {/* Programs */}
                            {dedupedChannels.map((ch, ri) => (
                                <div
                                    key={ch.id}
                                    className="absolute left-0 right-0"
                                    style={{ top: ri * CELL_H, height: CELL_H }}
                                >
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
                                                totalGridW={totalGridW}
                                                nowSec={nowSec}
                                                onClick={onProgramClick}
                                                didDrag={didDrag}
                                            />
                                        ))
                                    )}
                                </div>
                            ))}

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
