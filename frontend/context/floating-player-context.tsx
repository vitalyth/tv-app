"use client";

import dynamic from "next/dynamic";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { type Channel } from "@/lib/channels-data";
import { addRecentlyViewedChannel } from "@/hooks/useRecentlyViewed";
import { useDraggable } from "@/hooks/useDraggable";
import {
    kanVodService,
    type KanVodEpisode,
    type KanVodSeriesDetails,
} from "@/lib/services/kan-vod-service";

const VideoPlayer = dynamic(
    () => import("@/components/video-player").then((m) => m.VideoPlayer),
    { ssr: false }
);

type PlayOptions = {
    fullscreen?: boolean;
    onClose?: () => void;
    onEnded?: () => void;
};

type FloatingPlayerContextValue = {
    currentChannel: Channel | null;
    play: (channel: Channel, options?: PlayOptions) => void;
    close: () => void;
    setCloseHandler: (handler: (() => void) | null) => void;
};

type KanNextEpisodePreview = {
    series: KanVodSeriesDetails;
    episode: KanVodEpisode;
};

const FloatingPlayerContext = createContext<FloatingPlayerContextValue | null>(null);

const getKanSeasonTitle = (series: KanVodSeriesDetails, seasonId?: string | null) => {
    return series.seasons.find((season) => season.season_id === seasonId)?.title || "פרקים";
};

const kanEpisodeToChannel = (
    series: KanVodSeriesDetails,
    episode: KanVodEpisode,
): Channel => {
    const image = episode.episodeImage || episode.image || series.image || "/ch/vod.jpg";
    const episodeName = episode.episodeName || episode.title || `פרק ${episode.id}`;
    const seasonName = getKanSeasonTitle(series, episode.season_id);

    return {
        id: episode.id,
        index: 0,
        name: series.title,
        logo: image,
        category: "kan-vod",
        channelID: episode.streamUrl || episode.playUrl || episode.url,
        module: "kan-vod",
        mode: 0,
        linkDetails: {
            link: episode.streamUrl || episode.playUrl || episode.url,
            referer: "https://www.kan.org.il/",
            manifest_type: "hls",
        },
        type: "vod",
        programs: [],
        tvgID: "",
        url: episode.streamUrl,
        moreData: "",
        playerLogo: image,
        playerTitle: series.title,
        playerSubtitle: [seasonName, episodeName].filter(Boolean).join(" · "),
        vodProgramId: series.id,
        vodSeasonId: episode.season_id || undefined,
        vodMeta: {
            programName: series.title,
            seasonName,
            channelName: "כאן VOD",
            episodeName,
            episodeDescription: episode.episodeOverview || "",
            programDescription: series.description || "",
            programImage: series.image || "",
            channelImage: series.image || "",
            episodeImage: image,
        },
    };
};

export function FloatingPlayerProvider({ children }: { children: ReactNode }) {
    const playerRef = useRef<HTMLDivElement>(null);
    const closeHandlerRef = useRef<(() => void) | null>(null);
    const endedHandlerRef = useRef<(() => void) | null>(null);
    const viewportStateRef = useRef({
        isMobile: false,
        isMobileLandscape: false,
    });
    const orientationFrameRef = useRef<number | null>(null);
    const currentChannelRef = useRef<Channel | null>(null);
    const autoNextInProgressRef = useRef(false);

    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isMobileLandscape, setIsMobileLandscape] = useState(false);
    const [nextEpisodePreview, setNextEpisodePreview] = useState<KanNextEpisodePreview | null>(null);
    const [isAutoNextCancelled, setIsAutoNextCancelled] = useState(false);

    currentChannelRef.current = currentChannel;

    const { position, isDragging, dragHandleProps, restorePosition } = useDraggable(
        playerRef,
        !!currentChannel && !isFullscreen && !isMobile
    );

    const play = useCallback((channel: Channel, options?: PlayOptions) => {
        if (channel.type !== "vod") {
            addRecentlyViewedChannel(channel.id);
        }

        closeHandlerRef.current = options?.onClose ?? null;
        endedHandlerRef.current = options?.onEnded ?? null;
        setIsAutoNextCancelled(false);
        setNextEpisodePreview(null);
        setCurrentChannel(channel);
        setIsFullscreen(options?.fullscreen ?? isMobileLandscape);
    }, [isMobileLandscape]);

    const close = useCallback(() => {
        closeHandlerRef.current?.();
        closeHandlerRef.current = null;
        endedHandlerRef.current = null;
        setIsAutoNextCancelled(false);
        setNextEpisodePreview(null);
        setCurrentChannel(null);
        setIsFullscreen(false);
        restorePosition(true);
    }, [restorePosition]);

    const setCloseHandler = useCallback((handler: (() => void) | null) => {
        closeHandlerRef.current = handler;
    }, []);

    useEffect(() => {
        if (currentChannel?.module !== "kan-vod" || endedHandlerRef.current) {
            setNextEpisodePreview(null);
            return;
        }

        let isCurrent = true;
        setNextEpisodePreview(null);
        setIsAutoNextCancelled(false);

        kanVodService.getNextEpisode(currentChannel.id)
            .then(async (next) => {
                if (!next || !isCurrent) return;
                const series = await kanVodService.getSeriesDetails(next.programId);
                if (isCurrent) {
                    setNextEpisodePreview({ series, episode: next.episode });
                }
            })
            .catch((error) => {
                console.error("Failed to prepare next Kan VOD episode:", error);
            });

        return () => {
            isCurrent = false;
        };
    }, [currentChannel]);

    const handleEnded = useCallback(async () => {
        const customHandler = endedHandlerRef.current;
        if (customHandler) {
            customHandler();
            return;
        }

        const channel = currentChannelRef.current;
        if (
            autoNextInProgressRef.current ||
            isAutoNextCancelled ||
            channel?.module !== "kan-vod"
        ) {
            return;
        }

        autoNextInProgressRef.current = true;

        try {
            if (nextEpisodePreview) {
                play(kanEpisodeToChannel(nextEpisodePreview.series, nextEpisodePreview.episode), {
                    fullscreen: isFullscreen,
                });
                return;
            }

            const next = await kanVodService.getNextEpisode(channel.id);
            if (next) {
                const series = await kanVodService.getSeriesDetails(next.programId);
                play(kanEpisodeToChannel(series, next.episode), {
                    fullscreen: isFullscreen,
                });
            }
        } catch (error) {
            console.error("Failed to start next Kan VOD episode:", error);
        } finally {
            autoNextInProgressRef.current = false;
        }
    }, [isAutoNextCancelled, isFullscreen, nextEpisodePreview, play]);

    const onResize = useCallback(() => {
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

    useEffect(() => {
        if (!currentChannel) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);

        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [currentChannel, close]);

    useEffect(() => {
        const handleResize = () => {
            if (!playerRef.current || isMobile) return;

            const rect = playerRef.current.getBoundingClientRect();
            const corrected = {
                x: Math.max(0, Math.min(rect.left, window.innerWidth - rect.width)),
                y: Math.max(0, Math.min(rect.top, window.innerHeight - rect.height)),
            };

            if (rect.left !== corrected.x || rect.top !== corrected.y) {
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
        if (!currentChannel || !isMobile) return;

        setIsFullscreen((current) =>
            current === isMobileLandscape ? current : isMobileLandscape
        );

        if (!isMobileLandscape) {
            restorePosition(true);
        }
    }, [currentChannel, isMobile, isMobileLandscape, restorePosition]);

    useEffect(() => {
        const className = "floating-player-mobile-portrait-active";
        const isMobilePortraitPlayerOpen = !!currentChannel && isMobile && !isMobileLandscape;

        document.documentElement.classList.toggle(className, isMobilePortraitPlayerOpen);

        return () => {
            document.documentElement.classList.remove(className);
        };
    }, [currentChannel, isMobile, isMobileLandscape]);

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

                if (currentChannelRef.current && phoneLikeViewport) {
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

    const playerStyle: CSSProperties =
        position && !isFullscreen && !isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                transform: `translate(${position.x}px, ${position.y}px)`,
                zIndex: 900,
                transition: isDragging ? "none" : "box-shadow 0.2s",
                boxShadow: isDragging
                    ? "0 24px 64px rgba(0,0,0,0.7)"
                    : "0 8px 32px rgba(0,0,0,0.5)",
            }
            : {};

    const value = useMemo<FloatingPlayerContextValue>(() => ({
        currentChannel,
        play,
        close,
        setCloseHandler,
    }), [currentChannel, play, close, setCloseHandler]);

    return (
        <FloatingPlayerContext.Provider value={value}>
            {children}

            {currentChannel && (
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
                        channel={currentChannel}
                        onClose={close}
                        onEnded={handleEnded}
                        autoNextLabel={
                            !isAutoNextCancelled
                                ? nextEpisodePreview?.episode.episodeName ||
                                  nextEpisodePreview?.episode.title ||
                                  null
                                : null
                        }
                        onCancelAutoNext={() => setIsAutoNextCancelled(true)}
                        onResize={onResize}
                    />
                </div>
            )}

            <style jsx global>{`
                .player-overlay,
                .player-dragged,
                .player-overlay-fullscreen {
                    aspect-ratio: 16 / 9;
                    z-index: 900;
                    overflow: hidden;
                }

                .player-overlay,
                .player-dragged {
                    border-radius: 10px;
                }

                .player-overlay {
                    position: fixed;
                    width: clamp(400px, 40vw, 700px);
                    height: auto;
                    bottom: 20px;
                    right: 20px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
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
                        z-index: 1000;
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
                    .floating-player-mobile-portrait-active .site-content {
                        padding-top: calc(((100vw - 16px) * 9 / 16) + 16px);
                    }

                    .player-overlay,
                    .player-overlay-fullscreen {
                        position: fixed;
                        width: calc(100vw - 16px);
                        height: auto;
                        left: 8px;
                        right: 8px;
                        top: calc(var(--site-header-height, 73px) + 8px);
                        bottom: auto;
                        margin: 0;
                        transform: none;
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
                        rgba(0, 0, 0, 0.0) 100%
                    );
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 910;
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
        </FloatingPlayerContext.Provider>
    );
}

export function useFloatingPlayer() {
    const context = useContext(FloatingPlayerContext);

    if (!context) {
        throw new Error("useFloatingPlayer must be used inside FloatingPlayerProvider");
    }

    return context;
}
