"use client";

import dynamic from "next/dynamic";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { TopPlayerOverlay } from "@/components/player/top-player-overlay";
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

type PlayerContextValue = {
    currentChannel: Channel | null;
    programDetails: ProgramDetails | null;
    dockedCastControl: DockedCastControl | null;
    play: (channel: Channel, options?: PlayOptions) => void;
    playKanVodEpisode: (series: KanVodSeriesDetails, episode: KanVodEpisode, options?: PlayOptions) => void;
    close: () => void;
    showProgramDetails: (program: Program, channel: Channel) => void;
    clearProgramDetails: () => void;
    renderPlayer: (className?: string, options?: RenderPlayerOptions) => ReactNode;
    setDockedPlayerActive: (active: boolean) => void;
    setCloseHandler: (handler: (() => void) | null) => void;
    setDockedCastControl: (control: DockedCastControl | null) => void;
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
    registerDockedCastControl?: boolean;
};

type PlayerSlotState = {
    element: HTMLDivElement;
    className: string;
    hideTopControls: boolean;
    registerDockedCastControl: boolean;
};

export type DockedCastControl = {
    canCast: boolean;
    isAvailable: boolean;
    isCasting: boolean;
    isConnecting: boolean;
    onCast: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

const getViewportPlayerState = () => {
    if (typeof window === "undefined") {
        return {
            isMobile: false,
            isMobileLandscape: false,
        };
    }

    const compactWidth = window.matchMedia("(max-width: 499px)").matches;
    const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const phoneLikeViewport =
        compactWidth ||
        (coarsePointer && Math.min(window.innerWidth, window.innerHeight) <= 499);

    return {
        isMobile: phoneLikeViewport,
        isMobileLandscape: phoneLikeViewport && window.innerWidth > window.innerHeight,
    };
};

function PlayerSlot({
    attach,
    className,
    options,
}: {
    attach: (slot: PlayerSlotState | null, element?: HTMLDivElement) => void;
    className: string;
    options?: RenderPlayerOptions;
}) {
    const slotRef = useRef<HTMLDivElement | null>(null);
    const hideTopControls = Boolean(options?.hideTopControls);
    const registerDockedCastControl = Boolean(options?.registerDockedCastControl);

    useLayoutEffect(() => {
        const element = slotRef.current;
        if (!element) return;

        attach({
            element,
            className,
            hideTopControls,
            registerDockedCastControl,
        });

        return () => attach(null, element);
    }, [attach, className, hideTopControls, registerDockedCastControl]);

    return <div ref={slotRef} className="h-full w-full" />;
}

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

export function PlayerProvider({ children }: { children: ReactNode }) {
    const closeHandlerRef = useRef<(() => void) | null>(null);
    const endedHandlerRef = useRef<(() => void) | null>(null);
    const initialViewportState = useMemo(() => getViewportPlayerState(), []);
    const viewportStateRef = useRef(initialViewportState);
    const currentChannelRef = useRef<Channel | null>(null);
    const autoNextInProgressRef = useRef(false);
    const playerShellRef = useRef<HTMLDivElement | null>(null);
    const playerParkingRef = useRef<HTMLDivElement | null>(null);

    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMobile, setIsMobile] = useState(initialViewportState.isMobile);
    const [isMobileLandscape, setIsMobileLandscape] = useState(initialViewportState.isMobileLandscape);
    const [nextEpisodePreview, setNextEpisodePreview] = useState<KanNextEpisodePreview | null>(null);
    const [isAutoNextCancelled, setIsAutoNextCancelled] = useState(false);
    const [isDockedPlayerActive, setDockedPlayerActive] = useState(false);
    const [programDetails, setProgramDetails] = useState<ProgramDetails | null>(null);
    const [dockedCastControl, setDockedCastControl] = useState<DockedCastControl | null>(null);
    const [activePlayerSlot, setActivePlayerSlot] = useState<PlayerSlotState | null>(null);

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
        setIsFullscreen(options?.fullscreen ?? viewportStateRef.current.isMobileLandscape);
    }, []);

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

    useLayoutEffect(() => {
        if (!currentChannel || !isMobile) return;

        setIsFullscreen((current) =>
            current === isMobileLandscape ? current : isMobileLandscape
        );
    }, [currentChannel, isMobile, isMobileLandscape]);

    useLayoutEffect(() => {
        const className = "player-top-active";
        const isTopPlayerOpen = !!currentChannel && !isFullscreen && !isDockedPlayerActive;

        document.documentElement.classList.toggle(className, isTopPlayerOpen);

        return () => {
            document.documentElement.classList.remove(className);
        };
    }, [currentChannel, isDockedPlayerActive, isFullscreen]);

    useLayoutEffect(() => {
        const compactWidthMedia = window.matchMedia("(max-width: 499px)");
        const coarsePointerMedia = window.matchMedia("(hover: none) and (pointer: coarse)");

        const update = () => {
            const nextState = getViewportPlayerState();

            if (
                viewportStateRef.current.isMobile === nextState.isMobile &&
                viewportStateRef.current.isMobileLandscape === nextState.isMobileLandscape
            ) {
                return;
            }

            viewportStateRef.current = nextState;
            setIsMobile(nextState.isMobile);
            setIsMobileLandscape(nextState.isMobileLandscape);

            if (currentChannelRef.current && nextState.isMobile) {
                setIsFullscreen((current) =>
                    current === nextState.isMobileLandscape
                        ? current
                        : nextState.isMobileLandscape
                );
            }
        };

        update();

        compactWidthMedia.addEventListener("change", update);
        coarsePointerMedia.addEventListener("change", update);
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);
        window.visualViewport?.addEventListener("resize", update);

        return () => {
            compactWidthMedia.removeEventListener("change", update);
            coarsePointerMedia.removeEventListener("change", update);
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
            window.visualViewport?.removeEventListener("resize", update);
        };
    }, []);

    const attachPlayerSlot = useCallback((slot: PlayerSlotState | null, element?: HTMLDivElement) => {
        setActivePlayerSlot((current) => {
            if (!slot) {
                return current?.element === element ? null : current;
            }

            if (
                current?.element === slot.element &&
                current.className === slot.className &&
                current.hideTopControls === slot.hideTopControls &&
                current.registerDockedCastControl === slot.registerDockedCastControl
            ) {
                return current;
            }

            return slot;
        });
    }, []);

    useLayoutEffect(() => {
        const shell = playerShellRef.current;
        const parking = playerParkingRef.current;
        const host = activePlayerSlot?.element ?? parking;

        if (!shell || !host || shell.parentElement === host) return;

        host.appendChild(shell);
    }, [activePlayerSlot]);

    const renderPlayer = useCallback((className = "h-full w-full", options?: RenderPlayerOptions) => {
        if (!currentChannel) {
            return null;
        }

        return <PlayerSlot attach={attachPlayerSlot} className={className} options={options} />;
    }, [
        attachPlayerSlot,
        currentChannel,
    ]);

    const value = useMemo<PlayerContextValue>(() => ({
        currentChannel,
        programDetails,
        dockedCastControl,
        play,
        playKanVodEpisode,
        close,
        showProgramDetails,
        clearProgramDetails,
        renderPlayer,
        setDockedPlayerActive,
        setCloseHandler,
        setDockedCastControl,
    }), [
        clearProgramDetails,
        currentChannel,
        dockedCastControl,
        programDetails,
        play,
        playKanVodEpisode,
        close,
        renderPlayer,
        setCloseHandler,
        setDockedCastControl,
        showProgramDetails,
    ]);

    return (
        <PlayerContext.Provider value={value}>
            {children}
            <div ref={playerParkingRef} className="hidden" aria-hidden="true" />
            <div
                ref={playerShellRef}
                className={currentChannel && activePlayerSlot ? activePlayerSlot.className : "hidden"}
            >
                {currentChannel && (
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
                        hideTopControls={activePlayerSlot?.hideTopControls}
                        onCastControlChange={
                            activePlayerSlot?.registerDockedCastControl
                                ? setDockedCastControl
                            : undefined
                        }
                    />
                )}
            </div>
            <TopPlayerOverlay
                castControl={dockedCastControl}
                channel={currentChannel}
                isDocked={isDockedPlayerActive}
                isFullscreen={isFullscreen}
                onClose={close}
                renderPlayer={renderPlayer}
            />
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);

    if (!context) {
        throw new Error("usePlayer must be used inside PlayerProvider");
    }

    return context;
}
