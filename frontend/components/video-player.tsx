"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { Cast, X, Radio, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import videojs from "video.js"
import "videojs-contrib-dash"
import { type Channel } from "@/lib/channels-data"
import { channelService } from "@/lib/services/channel-service";
import { api } from "@/lib/api";
import ProgramDisplay from "@/components/program-display"
import { useCurrentProgram } from "@/hooks/useCurrentProgram";
import "@/styles/video-player.css";

if (!(videojs as any).getPlugin?.("qualityLevels")) {
    require("videojs-contrib-quality-levels")
}

const CAST_SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
const CAST_LOAD_TIMEOUT_MS = 10000

interface VideoPlayerProps {
    channel: Channel | null
    onClose: () => void,
    onResize?: () => void,
    className?: string,
}

const resizetoFill = (player: any, onResize: () => void) => {
    const Button = videojs.getComponent("Button") as any

    class ResizeButton extends Button {
        constructor(player: any, options: any) {
            super(player, options)

            this.controlText("Resize")
            this.addClass("vjs-resize-button")

            this.on(["click", "touchstart"], (e: any) => {
                e.stopPropagation()

                if (player.isFullscreen?.()) {
                    player.exitFullscreen()
                    return
                }

                if (document.fullscreenElement) {
                    document.exitFullscreen()
                    return
                }

                onResize()
            })
        }
    }

    videojs.registerComponent("ResizeButton", ResizeButton as any)

    player.controlBar.addChild(
        "ResizeButton",
        {},
        player.controlBar.children().length - 1
    )
}

const addQualitySelector = (player: any) => {
    const Button = videojs.getComponent("Button") as any

    class QualityButton extends Button {
        menu: HTMLDivElement
        handleDocumentPointerDown: (e: Event) => void
        handleMouseLeave: () => void

        constructor(player: any, options: any) {
            super(player, options)

            this.controlText("Quality")
            this.addClass("vjs-quality-button")

            // Create menu container
            this.menu = document.createElement("div")
            this.menu.className = "vjs-quality-menu hidden"
            this.el().appendChild(this.menu)

            this.handleDocumentPointerDown = this.onDocumentPointerDown.bind(this)
            this.handleMouseLeave = this.hideMenu.bind(this)

            document.addEventListener("pointerdown", this.handleDocumentPointerDown)
            this.el().addEventListener("mouseleave", this.handleMouseLeave)

            this.updateMenu()
        }

        showMenu() {
            this.menu.classList.remove("hidden")
        }

        hideMenu() {
            this.menu.classList.add("hidden")
        }

        // Toggle menu visibility
        handleClick(event?: Event) {
            event?.stopPropagation()

            if (this.menu.classList.contains("hidden")) {
                this.showMenu()
                return
            }

            this.hideMenu()
        }

        // Close menu when clicking/touching outside
        onDocumentPointerDown(e: Event) {
            const target = e.target as Node

            const clickedInsideMenu = this.menu.contains(target)
            const clickedButton = this.el().contains(target)

            if (!clickedInsideMenu && !clickedButton) {
                this.hideMenu()
            }
        }

        // Cleanup listeners
        dispose() {
            document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
            this.el().removeEventListener("mouseleave", this.handleMouseLeave)
            super.dispose()
        }

        // Check if Auto mode (all levels enabled)
        isAuto(levels: any) {
            for (let i = 0; i < levels.length; i++) {
                if (!levels[i].enabled) return false
            }
            return true
        }

        // Get actual playing quality using selectedIndex
        getCurrentHeight(levels: any): number | null {
            const index = levels.selectedIndex
            if (index === -1) return null

            return levels[index]?.height || null
        }

        // Convert resolution to category label
        getQualityLabel(height: number | null) {
            if (!height) return "SD"
            if (height >= 2160) return "4K"
            if (height >= 1080) return "HD"
            if (height >= 720) return "HD"
            return "SD"
        }

        // Remove duplicates and sort by height descending
        getUniqueLevels(levels: any) {
            const map = new Map<number, any>()

            for (let i = 0; i < levels.length; i++) {
                const level = levels[i]
                if (level.height && !map.has(level.height)) {
                    map.set(level.height, level)
                }
            }

            return Array.from(map.values()).sort((a, b) => b.height - a.height)
        }

        // Create a menu item
        createItem(label: string, isActive: boolean, onClick: () => void) {
            const item = document.createElement("div")
            item.innerText = label

            if (isActive) item.classList.add("active")

            item.onclick = (event) => {
                event.preventDefault()
                event.stopPropagation()
                onClick()
                this.updateMenu()
                this.hideMenu()
            }

            return item
        }

        // Main render function
        updateMenu() {
            const levels = player.qualityLevels()
            if (!levels || !levels.length) return

            this.menu.innerHTML = ""

            const autoMode = this.isAuto(levels)
            const currentHeight = this.getCurrentHeight(levels)

            // Update button label (SD / HD / 4K)
            const qualityLabel = this.getQualityLabel(currentHeight)

            this.el().setAttribute("data-quality", qualityLabel)
            this.el().classList.toggle("is-hd", qualityLabel === "HD")

            // Auto option with current resolution indication
            const autoLabel = currentHeight
                ? `Auto (${currentHeight}p)`
                : "Auto"

            this.menu.appendChild(
                this.createItem(autoLabel, autoMode, () => {
                    for (let i = 0; i < levels.length; i++) {
                        levels[i].enabled = true
                    }
                })
            )

            // Manual options
            const selectedHeight = autoMode ? null : currentHeight

            this.getUniqueLevels(levels).forEach(level => {
                this.menu.appendChild(
                    this.createItem(
                        `${level.height}p`,
                        level.height === selectedHeight,
                        () => {
                            for (let i = 0; i < levels.length; i++) {
                                levels[i].enabled = levels[i].height === level.height
                            }
                        }
                    )
                )
            })
        }
    }

    videojs.registerComponent("QualityButton", QualityButton as any)

    const playToggle = player.controlBar.getChild("PlayToggle")
    const playToggleIndex = playToggle
        ? player.controlBar.children().indexOf(playToggle)
        : 0

    player.controlBar.addChild(
        "QualityButton",
        {},
        playToggleIndex + 1
    )

    // Sync UI with player changes
    const levels = player.qualityLevels()

    const update = () => {
        const btn = player.controlBar.getChild("QualityButton") as any
        btn?.updateMenu()
    }

    levels.on("addqualitylevel", update)
    levels.on("change", update)
}

function waitForCastMediaSession(session: any, timeoutMs = CAST_LOAD_TIMEOUT_MS) {
    return new Promise<void>((resolve, reject) => {
        if (session?.getMediaSession?.()) {
            resolve()
            return
        }

        let didFinish = false
        let removeListener: (() => void) | null = null

        const finish = (error?: Error) => {
            if (didFinish) return
            didFinish = true
            window.clearTimeout(timeoutId)
            removeListener?.()

            if (error) {
                reject(error)
                return
            }

            resolve()
        }

        const timeoutId = window.setTimeout(() => {
            finish(new Error("Timed out waiting for cast media session"))
        }, timeoutMs)

        const castFramework = window.cast?.framework
        const eventType = castFramework?.SessionEventType?.MEDIA_SESSION

        if (!eventType || !session?.addEventListener) {
            finish(new Error("Cast media session listener is unavailable"))
            return
        }

        const onMediaSession = () => finish()
        session.addEventListener(eventType, onMediaSession)
        removeListener = () => session.removeEventListener?.(eventType, onMediaSession)
    })
}

export function VideoPlayer({ channel, onClose, onResize, className }: VideoPlayerProps) {
    const videoRef = useRef<HTMLDivElement>(null)
    const playerRef = useRef<any>(null)
    const castContextRef = useRef<any>(null)
    const isDisconnectingForCloseRef = useRef(false)
    const [hasError, setHasError] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [showOverlay, setShowOverlay] = useState(true);
    const [isCastAvailable, setIsCastAvailable] = useState(false);
    const [isCasting, setIsCasting] = useState(false);
    const [isCastConnecting, setIsCastConnecting] = useState(false);
    const [castError, setCastError] = useState<string | null>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveringRef = useRef(false);
    const currentProgram = useCurrentProgram(channel?.programs);

    function showControls() {
        setShowOverlay(true)

        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
        }

        if (isHoveringRef.current) return

        hideTimeoutRef.current = setTimeout(() => {
            setShowOverlay(false)
        }, 3000)
    }

    useEffect(() => {
        if (!channel) return;

        let isMounted = true;

        setIsLoading(true);

        channelService
            .getLiveChannel(channel)
            .then((data: { stream: string }) => {
                if (!isMounted) return;
                setStreamUrl(data.stream);
            })
            .catch((err) => {
                if (!isMounted) return;
                console.error("Failed to load stream:", err);
                setHasError(true);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [channel]);

    const resumeLocalPlayback = useCallback(() => {
        const player = playerRef.current;
        if (!player || player.isDisposed?.()) return;

        const playPromise = player.play?.();
        playPromise?.catch?.(() => {
            console.log("Autoplay blocked");
        });
    }, []);

    const pauseLocalPlayback = useCallback(() => {
        const player = playerRef.current;
        if (!player || player.isDisposed?.()) return;

        player.pause?.();
    }, []);

    const disconnectCast = useCallback(async (resumeLocal = true) => {
        const castContext = castContextRef.current;
        const session = castContext?.getCurrentSession?.();

        if (!session) {
            setIsCasting(false);
            setIsCastConnecting(false);
            if (resumeLocal) resumeLocalPlayback();
            return;
        }

        try {
            setIsCastConnecting(true);
            await castContext.endCurrentSession(true);
        } catch (error) {
            console.warn("Failed to disconnect cast session:", error);
        } finally {
            setIsCastConnecting(false);
            setIsCasting(false);
            if (resumeLocal) resumeLocalPlayback();
        }
    }, [resumeLocalPlayback]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        let castContext: any = null;
        let removeSessionListener: (() => void) | null = null;

        const updateSessionState = () => {
            const session = castContext?.getCurrentSession?.();
            const connected = Boolean(session);

            setIsCasting(connected);
            if (connected) {
                pauseLocalPlayback();
                return;
            }

            if (!isDisconnectingForCloseRef.current) {
                resumeLocalPlayback();
            }
        };

        const initializeCast = () => {
            const castFramework = window.cast?.framework;

            if (!castFramework || !window.chrome?.cast) {
                setIsCastAvailable(false);
                return;
            }

            castContext = castFramework.CastContext.getInstance();
            castContextRef.current = castContext;
            castContext.setOptions({
                receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
            });

            setIsCastAvailable(true);
            updateSessionState();

            const eventType = castFramework.CastContextEventType.SESSION_STATE_CHANGED;
            castContext.addEventListener(eventType, updateSessionState);
            removeSessionListener = () => {
                castContext?.removeEventListener?.(eventType, updateSessionState);
            };
        };

        const castApiCallback = (isAvailable: boolean) => {
            if (isAvailable) {
                initializeCast();
                return;
            }

            setIsCastAvailable(false);
        };

        if (window.cast?.framework && window.chrome?.cast) {
            initializeCast();
        } else {
            window.__onGCastApiAvailable = castApiCallback;

            if (!document.querySelector(`script[src="${CAST_SDK_URL}"]`)) {
                const script = document.createElement("script");
                script.src = CAST_SDK_URL;
                script.async = true;
                document.head.appendChild(script);
            }
        }

        return () => {
            removeSessionListener?.();
            if (window.__onGCastApiAvailable === castApiCallback) {
                window.__onGCastApiAvailable = undefined;
            }
        };
    }, [pauseLocalPlayback, resumeLocalPlayback]);

    const castToTv = async () => {
        if (!channel || !streamUrl || typeof window === "undefined") return;

        const castFramework = window.cast?.framework;
        const chromeCast = window.chrome?.cast;

        if (!window.isSecureContext) {
            setCastError("Cast דורש HTTPS בסביבת production");
            return;
        }

        if (!castFramework || !chromeCast) {
            setCastError("Cast לא זמין בדפדפן הזה. נסה Chrome באנדרואיד או בדסקטופ");
            return;
        }

        try {
            setCastError(null);
            setIsCastConnecting(true);

            if (isCasting || castContextRef.current?.getCurrentSession?.()) {
                await disconnectCast(true);
                return;
            }

            const referer = channel.linkDetails?.referer || "";
            const manifestType = channel.linkDetails?.manifest_type;
            const isDash =
                manifestType === "mpd" ||
                streamUrl.includes("/livedash/") ||
                streamUrl.endsWith(".mpd");
            const contentType = isDash
                ? "application/dash+xml"
                : "application/x-mpegURL";
            const sourcePath = api(`/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(referer)}`);
            const sourceUrl = new URL(sourcePath, window.location.origin).toString();

            const castContext = castFramework.CastContext.getInstance();
            castContextRef.current = castContext;
            const session = castContext.getCurrentSession() || await castContext.requestSession();
            const mediaInfo = new chromeCast.media.MediaInfo(sourceUrl, contentType);
            mediaInfo.streamType = chromeCast.media.StreamType.LIVE;
            mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata();
            mediaInfo.metadata.title = channel.name;
            mediaInfo.metadata.subtitle = currentProgram?.name || "";
            mediaInfo.metadata.images = [
                new chromeCast.Image(new URL(`/ch/${channel.logo}`, window.location.origin).toString()),
            ];

            const request = new chromeCast.media.LoadRequest(mediaInfo);
            request.autoplay = true;

            await session.loadMedia(request);
            await waitForCastMediaSession(session);
            pauseLocalPlayback();
            setIsCasting(true);
        } catch (error: any) {
            if (error?.code === "cancel" || error === "cancel") return;
            console.error("Failed to cast stream:", error);
            await disconnectCast(false);
            setCastError("לא הצלחנו להעביר לטלוויזיה");
        } finally {
            setIsCastConnecting(false);
        }
    };

    useEffect(() => {
        if (!streamUrl) return;
        if (!channel || !videoRef.current) return

        setHasError(false)
        setIsLoading(true)

        // Clean up previous player if exists
        if (playerRef.current) {
            playerRef.current.dispose()
            playerRef.current = null
            if (videoRef.current) {
                videoRef.current.innerHTML = ""
            }
        }

        const videoElement = document.createElement("video-js")
        videoElement.classList.add("vjs-big-play-centered")
        videoRef.current.appendChild(videoElement)

        const referer = channel?.linkDetails?.referer || ""
        const manifestType = channel?.linkDetails?.manifest_type
        const isDash =
            manifestType === "mpd" ||
            streamUrl.includes("/livedash/") ||
            streamUrl.endsWith(".mpd")
        const isSafari =
            typeof navigator !== "undefined" &&
            /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

        const player = videojs(videoElement, {
            autoplay: true,
            controls: true,
            responsive: true,
            //fluid: true,
            //muted: false,
            playsinline: true,
            liveui: true,
            //playbackRates: [0.5, 1, 1.5, 2],
            html5: {
                vhs: {
                    overrideNative: !isSafari,
                    withCredentials: false,
                },
                nativeAudioTracks: false,
                nativeVideoTracks: false,
            },
            sources: [
                {
                    src: api(`/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(referer)}`),
                    type: isDash
                        ? "application/dash+xml"
                        : "application/x-mpegURL",
                },
            ],
        })

        player.ready(() => {
            //player.muted(true);

            const playPromise = player.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    console.log("Autoplay blocked");
                });
            }
        })

        player.on("loadedmetadata", () => {
            try {
                if (!player || player.isDisposed?.()) return
                addQualitySelector(player);
                onResize && resizetoFill(player, onResize);
            } catch (e) {
                console.warn("Failed to add custom controls:", e);
            }
        })

        player.on("playing", () => {
            setIsLoading(false);
            setHasError(false);
            showControls();
        })

        player.on("error", () => {
            setHasError(true)
            setIsLoading(false)
        })

        player.on("waiting", () => {
            setIsLoading(true)
        })

        playerRef.current = player

        return () => {
            if (playerRef.current && !playerRef.current.isDisposed()) {
                playerRef.current.dispose()
                playerRef.current = null
            }
        }
    }, [streamUrl])

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }

            isDisconnectingForCloseRef.current = true;
            disconnectCast(false);
        }
    }, [disconnectCast])

    const handleClose = () => {
        isDisconnectingForCloseRef.current = true;
        disconnectCast(false).finally(onClose);
    }

    if (!channel) {
        return (
            <div className="relative aspect-video bg-card rounded-xl overflow-hidden flex items-center justify-center border border-border">
                <div className="text-center space-y-4">
                    <Radio className="w-16 h-16 text-muted-foreground mx-auto" />
                    <p className="text-xl text-muted-foreground">בחר ערוץ לצפייה</p>
                </div>
            </div>
        )
    }

    return (
        <div
            className={`relative rounded-xl overflow-hidden bg-black ${className || ""}`}
            onMouseEnter={() => {
                isHoveringRef.current = true
                showControls()
            }}
            onMouseLeave={() => {
                isHoveringRef.current = false
                showControls() // countdown start
            }}
            onTouchStart={() => {
                showControls()
            }}
            onClick={showControls}
        >
            {/* Header with channel info and close button */}
            <div className={`
                absolute 
                top-0 left-0 right-0 z-20 p-4 
                bg-linear-to-b 
                from-black/80 
                to-transparent 
                flex 
                items-center 
                justify-between 
                transition-opacity 
                duration-300 
                ${showOverlay
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                }`
            }>
                {/* Channel info */}
                <div className="flex items-center gap-3">
                    {/* Channel logo */}
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-lg"><img src={`/ch/${channel.logo}`} /></span>
                    </div>
                    {/* Channel name and current program */}
                    <div>
                        <h3 className="font-semibold text-white">{channel.name}</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <span className="text-xs"><ProgramDisplay program={currentProgram || channel.programs?.[0]} /></span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                            event.stopPropagation();
                            castToTv();
                        }}
                        disabled={!streamUrl || isCastConnecting || !isCastAvailable}
                        aria-pressed={isCasting}
                        className={`relative text-white hover:bg-white/20 disabled:opacity-40 ${isCasting ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                        title={streamUrl ? (isCasting ? "נתק מהטלוויזיה" : isCastAvailable ? "העבר לטלוויזיה" : "טוען Cast") : "טוען שידור"}
                        aria-label="העבר לטלוויזיה"
                    >
                        <Cast className="w-5 h-5" />
                        {isCasting && (
                            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-300 ring-1 ring-black/40" aria-hidden="true" />
                        )}
                    </Button>
                    {/* Close button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="text-white hover:bg-white/20"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {castError && showOverlay && (
                <div className="absolute left-4 top-20 z-20 max-w-[min(22rem,calc(100%-2rem))] rounded-md bg-red-950/90 px-3 py-2 text-sm text-white shadow-lg">
                    {castError}
                </div>
            )}

            {/* Video.js container */}
            <div className="relative w-full h-full bg-black">
                <div data-vjs-player className="absolute inset-0">
                    <div ref={videoRef} className="video-js-container w-full h-full" />
                </div>
            </div>

            {/* Loading state */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                    <div className="text-center space-y-4">
                        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse">
                            <span className="text-4xl"><img src={`/ch/${channel.logo}`} /></span>
                        </div>
                        <p className="text-white">טוען את הערוץ...</p>
                    </div>
                </div>
            )}

            {/* Error state */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                    <div className="text-center space-y-4 p-6">
                        <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
                            <AlertCircle className="w-10 h-10 text-destructive" />
                        </div>
                        <div>
                            <p className="text-white text-lg font-medium">לא ניתן לטעון את הערוץ</p>
                            <p className="text-muted-foreground text-sm mt-1">
                                הזרם אינו זמין כרגע או שכתובת ה-URL אינה תקינה
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="mt-4"
                        >
                            חזרה לרשימת הערוצים
                        </Button>
                    </div>
                </div>
            )}

            {/* Custom styles for Video.js */}
            <style jsx global>{`
                .vjs-resize-button:before {
                    content: "▣";
                    font-size: 1.8em;
                    line-height: 1.8;
                    cursor: pointer;
                    font-weight: 600;
                }

                /* מצב מורחב */
                .video-js.vjs-expanded {
                    position: fixed !important;
                    inset: 0;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 9999;
                    background: black;
                }

                .vjs-quality-button:before {
                    content: attr(data-quality);
                    /* SD / HD / 4K */
                    font-size: 1.4em;
                    line-height: 1.8;
                    font-weight: 700;
                    cursor: pointer;
                }

                .vjs-quality-button {
                    position: relative;
                }

                .vjs-quality-button.is-hd:before {
                    color: #e53935;
                }

                .vjs-quality-menu {
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(56, 54, 54, 0.75);
                    color: #fff;
                    padding: 6px 0;
                    min-width: 80px;
                    font-size: 11px;
                    z-index: 999;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                    text-align: center;
                }

                .vjs-quality-menu div {
                    padding: 6px 12px;
                    cursor: pointer;
                }

                .vjs-quality-menu div:hover {
                    background: rgba(255, 255, 255, 0.08);
                }

                .vjs-quality-menu .active {
                    color: #272727;
                    background-color: #FFF;
                }

                .vjs-quality-menu .active:hover {
                    color: #272727;
                    background-color: #bbbbbbd6;
                }
        `}  </style>
        </div>
    )
}
