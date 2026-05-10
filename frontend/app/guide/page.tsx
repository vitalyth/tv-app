"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { useChannelsContext } from "@/context/channels-context";
import ProgramGuide from "@/components/ProgramGuide";
import dynamic from "next/dynamic";
import { ChannelsFilters } from "@/components/channels-filters";
import { useFilteredChannels } from "@/hooks/useFilteredChannels";
import { Channel, Program } from "@/lib/channels-data";
import { useDraggable } from "@/hooks/useDraggable";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then(m => m.VideoPlayer),
    { ssr: false }
);

export default function GuidePage() {
    const { channels, refresh } = useChannelsContext();
    const playerRef = useRef<HTMLDivElement>(null);
    const viewportStateRef = useRef({
        isMobile: false,
        isMobileLandscape: false,
    });
    const orientationFrameRef = useRef<number | null>(null);
    const selectedChannelRef = useRef<Channel | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const filteredChannels = useFilteredChannels(channels, searchQuery, selectedCategory);
    const [isMobile, setIsMobile] = useState(false);
    const [isMobileLandscape, setIsMobileLandscape] = useState(false);

    selectedChannelRef.current = selectedChannel;

    const { position, isDragging, dragHandleProps, restorePosition } = useDraggable(
        playerRef,
        !!selectedChannel && !isFullscreen && !isMobile
    );

    const playChannel = useCallback((ch: Channel) => {
        setSelectedChannel(ch);
        setIsFullscreen(isMobileLandscape);
    }, [isMobileLandscape]);

    const handleProgramClick = useCallback((_program: Program, ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const handleChannelClick = useCallback((ch: Channel) => {
        playChannel(ch);
    }, [playChannel]);

    const handleClose = useCallback(() => {
        setSelectedChannel(null);
        setIsFullscreen(false);
        restorePosition(true);
    }, [restorePosition]);

    useEffect(() => {
        if (!selectedChannel) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);

        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [selectedChannel, handleClose]);

    const onResizeFull = useCallback(() => {
        if (isMobileLandscape) {
            setIsFullscreen(true);
            return;
        }

        setIsFullscreen((prev) => {
            const next = !prev;

            if (prev === true && next === false) {
                restorePosition();
            }

            return next;
        });
    }, [isMobileLandscape, restorePosition]);

    const refreshNow = useCallback(() => {
        refresh();
    }, [refresh]);

    const playerStyle: React.CSSProperties =
        position && !isFullscreen && !isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                transform: `translate(${position.x}px, ${position.y}px)`,
                zIndex: 110,
                transition: isDragging ? "none" : "box-shadow 0.2s",
                boxShadow: isDragging
                    ? "0 24px 64px rgba(0,0,0,0.7)"
                    : "0 8px 32px rgba(0,0,0,0.5)",
            }
            : {};

    useEffect(() => {
        const handleResize = () => {
            if (!playerRef.current) return;

            if (isMobile) {
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
    }, [isMobile]);

    useEffect(() => {
        if (isMobile) {
            restorePosition(true);
        }
    }, [isMobile, restorePosition]);

    useEffect(() => {
        if (!selectedChannel || !isMobile) return;

        setIsFullscreen((current) =>
            current === isMobileLandscape ? current : isMobileLandscape
        );

        if (!isMobileLandscape) {
            restorePosition(true);
        }
    }, [selectedChannel, isMobile, isMobileLandscape, restorePosition]);

    useEffect(() => {
        const compactWidthMedia = window.matchMedia("(max-width: 499px)");
        const coarsePointerMedia = window.matchMedia("(hover: none) and (pointer: coarse)");

        const update = () => {
            if (orientationFrameRef.current !== null) {
                return;
            }

            orientationFrameRef.current = requestAnimationFrame(() => {
                orientationFrameRef.current = null;

                const phoneLikeViewport =
                    compactWidthMedia.matches ||
                    (coarsePointerMedia.matches && Math.min(window.innerWidth, window.innerHeight) <= 499);
                const landscape = phoneLikeViewport && window.innerWidth > window.innerHeight;

                if (
                    viewportStateRef.current.isMobile === phoneLikeViewport &&
                    viewportStateRef.current.isMobileLandscape === landscape
                ) {
                    return;
                }

                viewportStateRef.current = {
                    isMobile: phoneLikeViewport,
                    isMobileLandscape: landscape,
                };

                setIsMobile(phoneLikeViewport);
                setIsMobileLandscape(landscape);

                if (selectedChannelRef.current && phoneLikeViewport) {
                    setIsFullscreen((current) =>
                        current === landscape ? current : landscape
                    );

                    if (!landscape) {
                        restorePosition(true);
                    }
                }
            });
        };

        update();

        compactWidthMedia.addEventListener("change", update);
        coarsePointerMedia.addEventListener("change", update);
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);

        return () => {
            if (orientationFrameRef.current !== null) {
                cancelAnimationFrame(orientationFrameRef.current);
            }

            compactWidthMedia.removeEventListener("change", update);
            coarsePointerMedia.removeEventListener("change", update);
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
        };
    }, [restorePosition]);

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
                            {!isFullscreen && !isMobile && (
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
                        sourceChannels={channels}
                        logoBasePath="/ch/"
                        playingChannelId={selectedChannel?.id}
                        playingChannelIndex={selectedChannel?.index}
                        onChannelClick={handleChannelClick}
                        onProgramClick={handleProgramClick}
                    />
                </div>
            </main>

            <style jsx global>{`
                .player-overlay,
                .player-dragged,
                .player-overlay-fullscreen {
                    aspect-ratio: 16 / 9;
                    z-index: 110;
                    overflow: hidden;
                }

                .player-overlay,
                .player-dragged {
                    border-radius: 10px;
                }

                .player-overlay {
                    position: relative;
                    width: auto;
                    height: 315px;
                    left: 50%;
                    margin-bottom: 7px;
                    transform: translate(-50%);
                }

                @media (min-width: 500px) {
                    .player-overlay {
                        position: absolute;
                        width: clamp(400px, 40vw, 700px);
                        height: auto;
                        bottom: 0;
                        right: 0;
                        left: auto;
                        top: auto;
                        margin: 0;
                        transform: none;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    }
                }

                .player-dragged {
                    width: clamp(400px, 40vw, 700px);
                    height: auto;
                    will-change: transform;
                }

                .player-overlay-fullscreen {
                    position: fixed;
                    width: 99vw;
                    height: 99vh;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    border-radius: 0;
                }

                @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 499px) {
                    .player-overlay,
                    .player-overlay-fullscreen {
                        position: fixed;
                        width: 99vw;
                        height: 99vh;
                        top: 50%;
                        left: 50%;
                        right: auto;
                        bottom: auto;
                        margin: 0;
                        transform: translate(-50%, -50%);
                        border-radius: 0;
                    }
                }

                @media (hover: none) and (pointer: coarse) and (orientation: portrait) and (max-width: 499px) {
                    .player-overlay,
                    .player-overlay-fullscreen {
                        position: relative;
                        width: auto;
                        height: 315px;
                        left: 50%;
                        top: auto;
                        right: auto;
                        bottom: auto;
                        margin-bottom: 7px;
                        transform: translate(-50%);
                        border-radius: 10px;
                    }
                }

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
                    z-index: 9999;
                    border-radius: 10px 10px 0 0;
                    opacity: 0;
                    pointer-events: auto;
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
