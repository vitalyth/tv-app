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
    type ReactNode,
} from "react";
import { type Channel, type Program } from "@/lib/channels-data";
import { addRecentlyViewedChannel } from "@/hooks/useRecentlyViewed";
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
    programDetails: ProgramDetails | null;
    play: (channel: Channel, options?: PlayOptions) => void;
    playKanVodEpisode: (series: KanVodSeriesDetails, episode: KanVodEpisode, options?: PlayOptions) => void;
    close: () => void;
    showProgramDetails: (program: Program, channel: Channel) => void;
    clearProgramDetails: () => void;
    renderPlayer: (className?: string, options?: RenderPlayerOptions) => ReactNode;
    setDockedPlayerActive: (active: boolean) => void;
    setCloseHandler: (handler: (() => void) | null) => void;
};

export type ProgramDetails = {
    program: Program;
    channel: Channel;
};

type KanNextEpisodePreview = {
    series: KanVodSeriesDetails;
    episode: KanVodEpisode;
};

type RenderPlayerOptions = {
    hideTopControls?: boolean;
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
    const [isDockedPlayerActive, setDockedPlayerActive] = useState(false);
    const [programDetails, setProgramDetails] = useState<ProgramDetails | null>(null);

    currentChannelRef.current = currentChannel;

    const play = useCallback((channel: Channel, options?: PlayOptions) => {
        if (channel.type !== "vod") {
            addRecentlyViewedChannel(channel.id);
        }

        closeHandlerRef.current = options?.onClose ?? null;
        endedHandlerRef.current = options?.onEnded ?? null;
        setIsAutoNextCancelled(false);
        setNextEpisodePreview(null);
        setProgramDetails(null);
        setCurrentChannel(channel);
        setIsFullscreen(options?.fullscreen ?? isMobileLandscape);
    }, [isMobileLandscape]);

    const playKanVodEpisode = useCallback((series: KanVodSeriesDetails, episode: KanVodEpisode, options?: PlayOptions) => {
        play(kanEpisodeToChannel(series, episode), options);
    }, [play]);

    const close = useCallback(() => {
        closeHandlerRef.current?.();
        closeHandlerRef.current = null;
        endedHandlerRef.current = null;
        setIsAutoNextCancelled(false);
        setNextEpisodePreview(null);
        setProgramDetails(null);
        setCurrentChannel(null);
        setIsFullscreen(false);
    }, []);

    const showProgramDetails = useCallback((program: Program, channel: Channel) => {
        closeHandlerRef.current?.();
        closeHandlerRef.current = null;
        endedHandlerRef.current = null;
        setIsAutoNextCancelled(false);
        setNextEpisodePreview(null);
        setCurrentChannel(null);
        setIsFullscreen(false);
        setProgramDetails({ program, channel });
    }, []);

    const clearProgramDetails = useCallback(() => {
        setProgramDetails(null);
    }, []);

    const setCloseHandler = useCallback((handler: (() => void) | null) => {
        closeHandlerRef.current = handler;
    }, []);

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
        if (!currentChannel || !isMobile) return;

        setIsFullscreen((current) =>
            current === isMobileLandscape ? current : isMobileLandscape
        );
    }, [currentChannel, isMobile, isMobileLandscape]);

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
    }, []);

    const renderPlayer = useCallback((className = "h-full w-full", options?: RenderPlayerOptions) => {
        if (!currentChannel) {
            return null;
        }

        return (
            <VideoPlayer
                className={className}
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
                hideTopControls={options?.hideTopControls}
            />
        );
    }, [
        close,
        currentChannel,
        handleEnded,
        isAutoNextCancelled,
        nextEpisodePreview,
    ]);

    const value = useMemo<FloatingPlayerContextValue>(() => ({
        currentChannel,
        programDetails,
        play,
        playKanVodEpisode,
        close,
        showProgramDetails,
        clearProgramDetails,
        renderPlayer,
        setDockedPlayerActive,
        setCloseHandler,
    }), [
        clearProgramDetails,
        currentChannel,
        programDetails,
        play,
        playKanVodEpisode,
        close,
        renderPlayer,
        setCloseHandler,
        showProgramDetails,
    ]);

    const shouldShowGlobalPlayer = currentChannel && (
        isFullscreen ||
        isMobile ||
        !isDockedPlayerActive
    );

    return (
        <FloatingPlayerContext.Provider value={value}>
            {children}

            {shouldShowGlobalPlayer && (
                <div
                    dir="rtl"
                    className={isFullscreen ? "player-overlay-fullscreen" : "player-overlay"}
                >
                    {renderPlayer("h-full w-full")}
                </div>
            )}

            <style jsx global>{`
                .player-overlay,
                .player-overlay-fullscreen {
                    aspect-ratio: 16 / 9;
                    z-index: 900;
                    overflow: hidden;
                }

                .player-overlay {
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
