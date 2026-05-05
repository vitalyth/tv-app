"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import dynamic from "next/dynamic";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel } from "@/lib/channels-data";
import { useDraggable } from "@/hooks/useDraggable";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then(m => m.VideoPlayer),
    { ssr: false }
);

export default function GuidePage() {
    const { channels, refresh } = useChannelsContext();
    const playerRef = useRef<HTMLDivElement>(null);
    const [selectedChannel, setSelectedChannel] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);
    const [isMobile, setIsMobile] = useState(false);

    // ── Drag ──────────────────────────────────────────────────────────────────
    const { position, isDragging, dragHandleProps, restorePosition } = useDraggable(
        playerRef,
        !!selectedChannel && !isFullscreen && !isMobile  // disable drag when fullscreen and mobile (width < 500)
    );

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleProgramClick = (prog: any, ch: Channel) => {
        setSelectedChannel(ch);
        restorePosition();
    };

    const handleChannelClick = (ch: Channel) => {
        setSelectedChannel(ch);
        restorePosition();
    };

    const handleClose = () => {
        setSelectedChannel(null);
        setIsFullscreen(false);
    };

    const onResizeFull = () => {
        setIsFullscreen((prev) => {
            const next = !prev;

            if (prev === true && next === false) {
                restorePosition();
            }

            return next;
        });
    };

    const refreshNow = useCallback(() => {
        refresh();
    }, [refresh]);

    // ── Player position style ─────────────────────────────────────────────────
    // On mobile (position===null) we fall back to CSS classes.
    // On desktop, once the user has dragged, position is a {x,y} fixed coordinate.
    const playerStyle: React.CSSProperties =
        position && !isFullscreen && !isMobile
            ? {
        position: "fixed",
        top: 0,
        left: 0,
        transform: "none",
        zIndex: 50,
        transition: isDragging ? "none" : "box-shadow 0.2s",
        boxShadow: isDragging
            ? "0 24px 64px rgba(0,0,0,0.7)"
            : "0 8px 32px rgba(0,0,0,0.5)",
            }
            : {};

    useEffect(() => {
        const handleResize = () => {
            if (!playerRef.current) return;

            // use ONE source of truth
            if (isMobile) {
                restorePosition(true);
                return;
            }

            const rect = playerRef.current.getBoundingClientRect();

            const corrected = {
                x: Math.max(0, Math.min(rect.left, window.innerWidth - rect.width)),
                y: Math.max(0, Math.min(rect.top, window.innerHeight - rect.height)),
            };

            if (
                rect.left !== corrected.x ||
                rect.top !== corrected.y
            ) {
                playerRef.current.style.transform =
                    `translate(${corrected.x}px, ${corrected.y}px)`;
            }
        };

        window.addEventListener("resize", handleResize);

        return () => window.removeEventListener("resize", handleResize);
    }, [restorePosition, isMobile]);


    useEffect(() => {
        if (isMobile) {
            restorePosition(true);
        }
    }, [isMobile, restorePosition]);


    useEffect(() => {
        const media = window.matchMedia("(max-width: 499px)");

        const update = () => {
            const matches = media.matches;

            console.log("matchMedia:", matches, "width:", window.innerWidth);

            setIsMobile(matches);
        };

        update();

        // BOTH listeners
        media.addEventListener("change", update);
        window.addEventListener("resize", update);

        return () => {
            media.removeEventListener("change", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    return (
        <div className="h-screen flex flex-col bg-background">
            <Header />

            <main className="flex-1 flex flex-col w-full px-4 py-4 overflow-hidden">
                <ChannelsFilters
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    onRefresh={refreshNow}
                />

                <div dir="ltr" className="relative flex-1 flex flex-col w-full overflow-hidden">

                    {selectedChannel && (
                        <div
                            ref={playerRef}
                            dir="rtl"
                            style={playerStyle}
                            className={
                                position && !isFullscreen && !isMobile
                                    ? "player-dragged"
                                    : isFullscreen
                                        ? "player-overlay-fullscreen"
                                        : "player-overlay"
                            }
                        >
                            {/* ── Drag handle bar ── */}
                            {!isFullscreen && (
                                <div
                                    {...dragHandleProps}
                                    className="player-drag-handle"
                                    title="גרור להזזה"
                                >
                                    <span className="drag-line" />
                                </div>
                            )}

                            <VideoPlayer
                                className="h-full w-full"
                                channel={selectedChannel}
                                onClose={handleClose}
                                onResize={onResizeFull}
                            />
                        </div>
                    )}

                    <ProgramGuide
                        channels={filteredChannels}
                        logoBasePath="/ch/"
                        onChannelClick={handleChannelClick}
                        onProgramClick={handleProgramClick}
                    />
                </div>
            </main>

            <style jsx global>{`
                /* ── Mobile: centered below filters ── */
                .player-overlay {
                    position: relative;
                    width: auto;
                    height: 315px;
                    aspect-ratio: 16 / 9;
                    left: 50%;
                    margin-bottom: 7px;
                    transform: translate(-50%);
                    z-index: 50;
                    border-radius: 10px;
                    overflow: hidden;
                }

                /* ── Desktop default: bottom-right corner ── */
                @media (min-width: 500px) {
                    .player-overlay {
                        position: absolute;
                        width: clamp(400px, 40vw, 700px);
                        height: auto;
                        aspect-ratio: 16 / 9;
                        bottom: 20px;
                        right: 20px;
                        left: auto;
                        top: auto;
                        margin: 0;
                        transform: none;
                        border-radius: 10px;
                        overflow: hidden;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    }
                }

                /* ── After first drag: fixed position (controlled by inline style) ── */
                .player-dragged {
                    width: clamp(400px, 40vw, 700px);
                    height: auto;
                    aspect-ratio: 16 / 9;
                    border-radius: 10px;
                    overflow: hidden;
                    will-change: transform;
                }

                /* ── Fullscreen ── */
                .player-overlay-fullscreen {
                    position: fixed;
                    width: 99vw;
                    height: 99vh;
                    aspect-ratio: 16 / 9;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 50;
                    border-radius: 0;
                    overflow: hidden;
                }

                @media (max-width: 500px) {
                    .player-drag-handle {
                        display: none;
                    }
                }

                /* ── Drag handle ── */
                .player-drag-handle {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 28px;
                    background: linear-gradient(
                        to bottom,
                        rgba(0, 0, 0, 0.65) 0%,
                        rgba(0, 0, 0, 0.0)  100%
                    );
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 50;
                    border-radius: 10px 10px 0 0;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .player-dragged:hover .player-drag-handle,
                .player-overlay:hover .player-drag-handle {
                    opacity: 1;
                }

                .drag-line {
                    width: 70px;
                    height: 4px;
                    background: rgba(255,255,255,0.7);
                    border-radius: 2px;
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
}
