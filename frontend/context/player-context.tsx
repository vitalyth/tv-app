"use client";

import dynamic from "next/dynamic";
import { Cast, X } from "lucide-react";
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

export type DockedCastControl = {
    canCast: boolean;
    isAvailable: boolean;
    isCasting: boolean;
    isConnecting: boolean;
    onCast: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

const resolvePlayerPanelImage = (image?: string): string => {
    if (!image) return "";
    if (image.startsWith("http://") || image.startsWith("https://")) return image;
    if (image.startsWith("//")) return `https:${image}`;
    if (image.startsWith("/")) return image;
    return `/ch/${image}`;
};

const findCurrentProgram = (channel: Channel | null): Program | null => {
    if (!channel?.programs?.length) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    return channel.programs.find((program) => nowSec >= program.start && nowSec < program.end) ?? null;
};

const formatPlayerTime = (ts: number): string => {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
};

const formatPlayerTimeRange = (start: number, end: number): string => {
    return `${formatPlayerTime(start)} - ${formatPlayerTime(end)}`;
};

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
    const [dockedCastControl, setDockedCastControl] = useState<DockedCastControl | null>(null);

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
        const className = "player-top-active";
        const isTopPlayerOpen = !!currentChannel && !isFullscreen && !isDockedPlayerActive;

        document.documentElement.classList.toggle(className, isTopPlayerOpen);

        return () => {
            document.documentElement.classList.remove(className);
        };
    }, [currentChannel, isDockedPlayerActive, isFullscreen]);

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
        window.addEventListener("orientationchange", update);

        return () => {
            if (orientationFrameRef.current !== null) {
                cancelAnimationFrame(orientationFrameRef.current);
            }

            compactWidthMedia.removeEventListener("change", update);
            coarsePointerMedia.removeEventListener("change", update);
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
                onCastControlChange={options?.registerDockedCastControl ? setDockedCastControl : undefined}
            />
        );
    }, [
        close,
        currentChannel,
        handleEnded,
        isAutoNextCancelled,
        nextEpisodePreview,
        setDockedCastControl,
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

    const shouldShowGlobalPlayer = currentChannel && (isFullscreen || !isDockedPlayerActive);
    const topPlayerProgram = !isFullscreen ? findCurrentProgram(currentChannel) : null;
    const topPlayerImage = resolvePlayerPanelImage(
        topPlayerProgram?.image ||
        currentChannel?.vodMeta?.episodeImage ||
        currentChannel?.vodMeta?.programImage ||
        currentChannel?.playerLogo ||
        currentChannel?.logo
    );
    const topPlayerTitle =
        topPlayerProgram?.name ||
        currentChannel?.vodMeta?.episodeName ||
        currentChannel?.playerSubtitle ||
        currentChannel?.playerTitle ||
        currentChannel?.name ||
        "";
    const topPlayerSubtitle = topPlayerProgram
        ? currentChannel?.name || ""
        : currentChannel?.vodMeta
            ? [currentChannel.vodMeta.channelName, currentChannel.vodMeta.seasonName].filter(Boolean).join(" · ")
            : currentChannel?.name || "";
    const topPlayerDescription =
        topPlayerProgram?.description ||
        currentChannel?.vodMeta?.episodeDescription ||
        currentChannel?.vodMeta?.programDescription ||
        "";
    const topPlayerChannelName = currentChannel?.vodMeta?.channelName || currentChannel?.name || "";
    const topPlayerTimeRange = topPlayerProgram
        ? formatPlayerTimeRange(topPlayerProgram.start, topPlayerProgram.end)
        : "";
    const isTopPlayerLive = Boolean(currentChannel?.type !== "vod" && topPlayerProgram);
    const shouldShowTopPlayerDetails = !isFullscreen && Boolean(topPlayerDescription);
    const topPlayerWithDetailsClass = shouldShowTopPlayerDetails ? "player-overlay--with-details" : "";

    return (
        <PlayerContext.Provider value={value}>
            {children}

            {shouldShowGlobalPlayer && (
                <div
                    dir={isFullscreen ? "rtl" : "ltr"}
                    className={isFullscreen ? "player-overlay-fullscreen" : `player-overlay ${topPlayerWithDetailsClass}`}
                >
                    {shouldShowTopPlayerDetails && (
                        <aside dir="rtl" className="player-overlay__details">
                            {topPlayerImage && (
                                <img
                                    src={topPlayerImage}
                                    alt=""
                                    className="player-overlay__details-image"
                                    loading="lazy"
                                />
                            )}
                            <div className="player-overlay__details-scrim" />
                            <div className="player-overlay__details-copy">
                                <div className="mb-4 flex items-start justify-between gap-4">
                                    <div className="min-w-0 text-right">
                                        {topPlayerChannelName && (
                                            <p className="truncate text-xs font-semibold leading-5 text-white/75">
                                                {topPlayerChannelName}
                                            </p>
                                        )}
                                        <h2 className="line-clamp-2 text-xl font-bold leading-7 text-foreground">
                                            {topPlayerTitle || currentChannel?.name}
                                        </h2>
                                        {(topPlayerTimeRange || isTopPlayerLive) && (
                                            <p className="mt-1 flex items-center justify-end gap-1.5 truncate text-xs leading-5 text-white/70">
                                                {isTopPlayerLive && (
                                                    <span className="relative flex h-2 w-2 shrink-0">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                                    </span>
                                                )}
                                                {topPlayerTimeRange && <span dir="ltr">{topPlayerTimeRange}</span>}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {dockedCastControl && (
                                            <button
                                                type="button"
                                                onClick={dockedCastControl.onCast}
                                                disabled={
                                                    dockedCastControl.isConnecting ||
                                                    !dockedCastControl.canCast ||
                                                    (!dockedCastControl.isAvailable && !dockedCastControl.isCasting)
                                                }
                                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/45 hover:text-white disabled:pointer-events-none disabled:opacity-40 ${dockedCastControl.isCasting ? "text-primary" : ""}`}
                                                aria-label={dockedCastControl.isCasting ? "עצור Cast" : "הפעל Cast"}
                                                title={
                                                    !dockedCastControl.canCast
                                                        ? "Cast is not ready"
                                                        : !dockedCastControl.isAvailable && !dockedCastControl.isCasting
                                                            ? "Cast device not available"
                                                            : dockedCastControl.isCasting
                                                                ? "Stop casting"
                                                                : "Cast"
                                                }
                                            >
                                                <Cast className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={close}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/45 hover:text-white"
                                            aria-label="סגור נגן"
                                        >
                                            <X className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                                {topPlayerDescription && (
                                    <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                                        {topPlayerDescription}
                                    </p>
                                )}
                            </div>
                        </aside>
                    )}
                    <div className={isFullscreen ? "h-full w-full" : "player-overlay__player"}>
                        {renderPlayer(`h-full w-full ${shouldShowTopPlayerDetails ? "player-overlay__video-root" : ""}`, {
                            registerDockedCastControl: shouldShowTopPlayerDetails,
                        })}
                    </div>
                </div>
            )}

            <style jsx global>{`
                .player-overlay-fullscreen,
                .player-overlay__player {
                    aspect-ratio: 16 / 9;
                    overflow: hidden;
                }

                .player-overlay {
                    position: fixed;
                    z-index: 900;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr);
                    width: min(calc(100vw - 16px), 1180px);
                    top: calc(var(--site-header-height, 73px) + 8px);
                    left: 50%;
                    transform: translateX(-50%);
                    align-items: stretch;
                    justify-content: center;
                    pointer-events: none;
                }

                .player-overlay__player {
                    justify-self: center;
                    width: min(64vh, 391px, calc(100vw - 16px));
                    height: min(36vh, 220px, calc((100vw - 16px) * 9 / 16));
                    border-radius: 10px;
                    box-shadow: 0 10px 34px rgba(0,0,0,0.45);
                    pointer-events: auto;
                }

                .player-overlay__details {
                    position: relative;
                    display: none;
                    min-width: 0;
                    overflow: hidden;
                    border: 1px solid hsl(var(--border));
                    border-left: 0;
                    border-radius: 10px 0 0 10px;
                    background: hsl(var(--card));
                    pointer-events: auto;
                }

                .player-overlay__details-image {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    opacity: 0.42;
                    filter: blur(12px) saturate(1.05);
                    transform: scale(1.08);
                }

                .player-overlay__details-scrim {
                    position: absolute;
                    inset: 0;
                    background:
                        linear-gradient(90deg, rgba(13, 29, 32, 0.72), rgba(13, 29, 32, 0.94)),
                        linear-gradient(0deg, hsl(var(--card) / 0.74), transparent 60%);
                }

                .player-overlay__details-copy {
                    position: relative;
                    z-index: 1;
                    height: 100%;
                    max-height: 100%;
                    overflow-y: auto;
                    padding: 22px;
                }

                .player-overlay-fullscreen {
                    position: fixed;
                    z-index: 900;
                    width: 99vw;
                    height: 99vh;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    border-radius: 0;
                }

                @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 499px) {
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

                .player-top-active .site-content {
                    padding-top: calc(min(36vh, 220px, calc((100vw - 16px) * 9 / 16)) + 16px);
                }

                @media (min-width: 820px) {
                    .player-overlay--with-details {
                        grid-template-columns: minmax(0, 1fr) auto;
                        width: min(calc(100vw - 16px), 1180px);
                        box-shadow: 0 10px 34px rgba(0,0,0,0.45);
                    }

                    .player-overlay__details {
                        display: block;
                        grid-column: 1;
                        grid-row: 1;
                        height: min(36vh, 220px, calc((100vw - 16px) * 9 / 16));
                        max-height: min(36vh, 220px, calc((100vw - 16px) * 9 / 16));
                        border-radius: 10px 0 0 10px;
                    }

                    .player-overlay--with-details .player-overlay__player {
                        grid-column: 2;
                        grid-row: 1;
                        justify-self: end;
                        border-radius: 0 10px 10px 0;
                        box-shadow: none;
                    }

                    .player-overlay--with-details .player-overlay__video-root,
                    .player-overlay--with-details .player-overlay__player [data-player-root],
                    .player-overlay--with-details .player-overlay__player [data-vjs-player],
                    .player-overlay--with-details .player-overlay__player .video-js-container,
                    .player-overlay--with-details .player-overlay__player .video-js,
                    .player-overlay--with-details .player-overlay__player video {
                        border-top-left-radius: 0 !important;
                        border-bottom-left-radius: 0 !important;
                        border-top-right-radius: 10px !important;
                        border-bottom-right-radius: 10px !important;
                    }

                    .player-overlay--with-details .custom-player-controls__top {
                        display: none;
                    }
                }

                @media (max-width: 767px) {
                    .player-overlay {
                        width: calc(100vw - 16px);
                    }
                }

            `}</style>
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
