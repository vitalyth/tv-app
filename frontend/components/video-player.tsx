"use client"

import { useCallback, useRef, useEffect, useMemo, useState } from "react"
import { Cast, X, Radio, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import videojs from "video.js"
import "videojs-contrib-dash"
import { type Channel } from "@/lib/channels-data"
import { channelService } from "@/lib/services/channel-service";
import { api } from "@/lib/api";
import ProgramDisplay from "@/components/program-display"
import { useCurrentProgram } from "@/hooks/useCurrentProgram";
import { useGoogleCast } from "@/hooks/useGoogleCast";
import "@/styles/video-player.css";

if (!(videojs as any).getPlugin?.("qualityLevels")) {
    require("videojs-contrib-quality-levels")
}

interface VideoPlayerProps {
    channel: Channel | null
    sourceChannels?: Channel[]
    onClose: () => void,
    onResize?: () => void,
    onChannelChange?: (channel: Channel) => void,
    className?: string,
}

type PlayerMenuPosition = {
    left: number
    bottom: number
}

const getChannelSourceKey = (channel: Channel) => {
    return channel.tvgID || channel.id || channel.channelID || String(channel.index)
}

const getSourceOptions = (channel: Channel | null, sourceChannels: Channel[] = []) => {
    if (!channel) return []

    const sourceKey = getChannelSourceKey(channel)
    const sources = sourceChannels.filter((source) => getChannelSourceKey(source) === sourceKey)

    return sources.length ? sources : [channel]
}

const getSourceLabel = (channel: Channel): string => channel.name

const PLAYER_MENU_WIDTH = 176
const PLAYER_MENU_EDGE_GAP = 2

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

        constructor(player: any, options: any) {
            super(player, options)

            this.controlText("Quality")
            this.addClass("vjs-quality-button")

            this.menu = document.createElement("div")
            this.menu.className = "vjs-quality-menu hidden"
            this.el().appendChild(this.menu)

            this.handleDocumentPointerDown = this.onDocumentPointerDown.bind(this)

            document.addEventListener("pointerdown", this.handleDocumentPointerDown)

            this.updateMenu()
        }

        showMenu() {
            this.menu.classList.remove("hidden")
        }

        hideMenu() {
            this.menu.classList.add("hidden")
        }

        handleClick(event?: Event) {
            event?.stopPropagation()

            if (this.menu.classList.contains("hidden")) {
                this.showMenu()
                return
            }

            this.hideMenu()
        }

        onDocumentPointerDown(e: Event) {
            const target = e.target as Node
            const clickedInsideMenu = this.menu.contains(target)
            const clickedButton = this.el().contains(target)

            if (!clickedInsideMenu && !clickedButton) {
                this.hideMenu()
            }
        }

        dispose() {
            document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
            super.dispose()
        }

        isAuto(levels: any) {
            for (let i = 0; i < levels.length; i++) {
                if (!levels[i].enabled) return false
            }

            return true
        }

        getCurrentHeight(levels: any): number | null {
            const index = levels.selectedIndex
            if (index === -1) return null

            return levels[index]?.height || null
        }

        getQualityLabel(height: number | null) {
            if (!height) return "SD"
            if (height >= 2160) return "4K"
            if (height >= 1080) return "HD"
            if (height >= 720) return "HD"
            return "SD"
        }

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

        updateMenu() {
            const levels = player.qualityLevels()
            if (!levels || !levels.length) return

            this.menu.innerHTML = ""

            const autoMode = this.isAuto(levels)
            const currentHeight = this.getCurrentHeight(levels)
            const qualityLabel = this.getQualityLabel(currentHeight)

            this.el().setAttribute("data-quality", qualityLabel)
            this.el().classList.toggle("is-hd", qualityLabel === "HD")

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

const addSourceSelector = (
    player: any,
    sourceOptions: Channel[],
    activeChannelId: string | null | undefined,
    onSelectSource?: (channel: Channel) => void,
    onToggleSourceMenu?: (buttonEl: HTMLElement) => void
) => {
    if (sourceOptions.length <= 1 || !onSelectSource || !onToggleSourceMenu) return

    const Button = videojs.getComponent("Button") as any

    if (!videojs.getComponent("SourceButton")) {
        class SourceButton extends Button {
            constructor(player: any, options: any) {
                super(player, options)

                this.controlText("Source")
                this.addClass("vjs-source-button")
                this.addClass("vjs-icon-chapters")
                this.el().setAttribute("data-source-trigger", "true")
            }

            handleClick(event?: Event) {
                event?.preventDefault()
                event?.stopPropagation()
                this.options_.onToggleSourceMenu(this.el())
            }
        }

        videojs.registerComponent("SourceButton", SourceButton as any)
    }

    const qualityButton = player.controlBar.getChild("QualityButton")
    const qualityButtonIndex = qualityButton
        ? player.controlBar.children().indexOf(qualityButton)
        : 1

    player.controlBar.addChild(
        "SourceButton",
        {
            sourceOptions,
            activeChannelId,
            onSelectSource,
            onToggleSourceMenu,
        },
        qualityButtonIndex + 1
    )
}

export function VideoPlayer({
    channel,
    sourceChannels,
    onClose,
    onResize,
    onChannelChange,
    className
}: VideoPlayerProps) {
    const playerRootRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLDivElement>(null)
    const playerRef = useRef<any>(null)
    const suppressCastVolumeSyncRef = useRef(false)
    const isCastingRef = useRef(false)
    const setCastVolumeRef = useRef<(volume: number, muted: boolean) => Promise<void> | void>(() => undefined)
    const onChannelChangeRef = useRef<((channel: Channel) => void) | undefined>(onChannelChange)
    const [hasError, setHasError] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [showOverlay, setShowOverlay] = useState(true);
    const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
    const [sourceMenuPosition, setSourceMenuPosition] = useState<PlayerMenuPosition | null>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveringRef = useRef(false);
    const currentProgram = useCurrentProgram(channel?.programs);
    const sourceOptions = useMemo(
        () => getSourceOptions(channel, sourceChannels),
        [channel, sourceChannels]
    );

    useEffect(() => {
        onChannelChangeRef.current = onChannelChange
    }, [onChannelChange])

    const showControls = useCallback(() => {
        setShowOverlay(true)

        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
        }

        if (isHoveringRef.current) return

        hideTimeoutRef.current = setTimeout(() => {
            setShowOverlay(false)
        }, 3000)
    }, [])

    const getMenuPosition = useCallback((buttonEl: HTMLElement): PlayerMenuPosition | null => {
        const rootEl = playerRootRef.current
        if (!rootEl) return null

        const rootRect = rootEl.getBoundingClientRect()
        const buttonRect = buttonEl.getBoundingClientRect()
        const menuHalfWidth = PLAYER_MENU_WIDTH / 2
        const buttonCenter = buttonRect.left - rootRect.left + buttonRect.width / 2

        return {
            left: Math.max(
                menuHalfWidth + PLAYER_MENU_EDGE_GAP,
                Math.min(buttonCenter, rootRect.width - menuHalfWidth - PLAYER_MENU_EDGE_GAP)
            ),
            bottom: rootRect.bottom - buttonRect.top + 8,
        }
    }, [])

    const toggleSourceMenu = useCallback((buttonEl: HTMLElement) => {
        const position = getMenuPosition(buttonEl)
        if (!position) return

        setSourceMenuPosition(position)
        setIsSourceMenuOpen((current) => !current)
        showControls()
    }, [getMenuPosition, showControls])

    const closePlayerMenus = useCallback(() => {
        setIsSourceMenuOpen(false)

        const qualityButton = playerRef.current?.controlBar?.getChild?.("QualityButton") as any
        qualityButton?.hideMenu?.()
    }, [])

    const pauseLocalPlayerForCasting = useCallback((player: any) => {
        if (!player || player.isDisposed?.()) return

        suppressCastVolumeSyncRef.current = true
        player.pause()
        player.muted(true)
        setIsLoading(false)
        window.setTimeout(() => {
            suppressCastVolumeSyncRef.current = false
        }, 0)
    }, [])

    const handleCastStarted = useCallback(() => {
        pauseLocalPlayerForCasting(playerRef.current)
    }, [pauseLocalPlayerForCasting])

    const handleCastEnded = useCallback(() => {
        const player = playerRef.current
        if (!player || player.isDisposed?.()) return

        suppressCastVolumeSyncRef.current = true
        player.muted(false)
        player.liveTracker?.seekToLiveEdge?.()
        player.play()?.catch?.(() => undefined)
        window.setTimeout(() => {
            suppressCastVolumeSyncRef.current = false
        }, 0)
    }, [])

    const {
        isAvailable: isCastAvailable,
        isCasting,
        isConnecting: isCastConnecting,
        requestCastSession,
        setVolume: setCastVolume,
        stopCasting,
    } = useGoogleCast({
        channel,
        streamUrl,
        programName: currentProgram?.name,
        onCastStarted: handleCastStarted,
        onCastEnded: handleCastEnded,
    })

    useEffect(() => {
        isCastingRef.current = isCasting
        setCastVolumeRef.current = setCastVolume
    }, [isCasting, setCastVolume])

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

        const keepLocalPaused = isCastingRef.current

        const player = videojs(videoElement, {
            autoplay: !keepLocalPaused,
            controls: true,
            responsive: true,
            //fluid: true,
            muted: keepLocalPaused,
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

            if (isCastingRef.current) {
                pauseLocalPlayerForCasting(player)
                return
            }

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
                addSourceSelector(
                    player,
                    sourceOptions,
                    channel.id,
                    (source) => onChannelChangeRef.current?.(source),
                    toggleSourceMenu
                );
                onResize && resizetoFill(player, onResize);
            } catch (e) {
                console.warn("Failed to add custom controls:", e);
            }
        })

        player.on("playing", () => {
            if (isCastingRef.current) {
                pauseLocalPlayerForCasting(player)
                return
            }

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

        player.on("volumechange", () => {
            if (!isCastingRef.current || suppressCastVolumeSyncRef.current) return
            setCastVolumeRef.current(player.volume() ?? 1, player.muted() ?? false)
        })

        playerRef.current = player

        return () => {
            if (playerRef.current && !playerRef.current.isDisposed()) {
                playerRef.current.dispose()
                playerRef.current = null
            }
        }
    }, [streamUrl, sourceOptions, channel, onResize, pauseLocalPlayerForCasting, toggleSourceMenu])

    useEffect(() => {
        const player = playerRef.current
        if (!player || player.isDisposed?.() || !isCasting) return

        pauseLocalPlayerForCasting(player)
    }, [isCasting, pauseLocalPlayerForCasting])

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (sourceOptions.length <= 1) {
            setIsSourceMenuOpen(false)
        }
    }, [sourceOptions.length])

    useEffect(() => {
        if (!isSourceMenuOpen) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null

            if (
                target?.closest("[data-source-trigger]") ||
                target?.closest("[data-player-source-menu]")
            ) {
                return
            }

            setIsSourceMenuOpen(false)
        }

        document.addEventListener("pointerdown", handlePointerDown)

        return () => document.removeEventListener("pointerdown", handlePointerDown)
    }, [isSourceMenuOpen])

    const handleClose = () => {
        if (!isCastingRef.current) {
            onClose();
            return
        }

        stopCasting().finally(onClose)
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
            ref={playerRootRef}
            className={`relative rounded-xl overflow-hidden bg-black ${showOverlay ? "player-controls-visible" : "player-controls-hidden"} ${className || ""}`}
            onMouseEnter={() => {
                isHoveringRef.current = true
                showControls()
            }}
            onMouseLeave={() => {
                isHoveringRef.current = false
                closePlayerMenus()
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
                    {isCastAvailable && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={isCasting ? stopCasting : requestCastSession}
                            disabled={isCastConnecting || !streamUrl}
                            className={`text-white hover:bg-white/20 ${isCasting ? "text-primary" : ""}`}
                            title={isCasting ? "Stop casting" : "Cast"}
                        >
                            <Cast className="w-5 h-5" />
                        </Button>
                    )}
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

            {/* Video.js container */}
            <div className="relative w-full h-full bg-black">
                <div data-vjs-player className="absolute inset-0">
                    <div ref={videoRef} className="video-js-container w-full h-full" />
                </div>
            </div>

            {showOverlay && isSourceMenuOpen && sourceMenuPosition && sourceOptions.length > 1 && (
                <div
                    data-player-source-menu
                    dir="rtl"
                    className="player-control-menu absolute z-30 overflow-hidden rounded-xl border border-white/15 bg-zinc-950/95 text-white shadow-2xl shadow-black/70 ring-1 ring-black/40 backdrop-blur-xl transition-opacity duration-300"
                    style={{
                        left: sourceMenuPosition.left,
                        bottom: sourceMenuPosition.bottom,
                        width: PLAYER_MENU_WIDTH,
                        transform: "translateX(-50%)",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="bg-white/[0.03] px-2 py-1">
                        <p className="text-[10px] font-semibold leading-4 text-zinc-400">בחר מקור</p>
                        <p className="truncate text-[10px] font-medium leading-4 text-zinc-100">{channel.name}</p>
                    </div>
                    <div className="max-h-36 overflow-y-auto p-0.5">
                        {sourceOptions.map((source) => {
                            const isActive = source.id === channel.id

                            return (
                                <button
                                    key={source.id}
                                    type="button"
                                    className={`
                                        flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-right transition-colors
                                        ${isActive
                                            ? "bg-white text-zinc-950 shadow-sm"
                                            : "text-zinc-100 hover:bg-white/10"
                                        }
                                    `}
                                    onClick={() => {
                                        setIsSourceMenuOpen(false)

                                        if (!isActive) {
                                            onChannelChangeRef.current?.(source)
                                        }
                                    }}
                                >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded ${isActive ? "bg-zinc-200" : "bg-zinc-800"}`}>
                                        <img
                                            src={`/ch/${source.logo}`}
                                            alt=""
                                            className="h-full w-full object-contain"
                                            onError={(event) => {
                                                (event.target as HTMLImageElement).style.display = "none"
                                            }}
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[10px] font-medium leading-5">
                                        {getSourceLabel(source)}
                                    </span>
                                    {isActive && (
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" aria-hidden="true" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

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
                            onClick={handleClose}
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
                    line-height: 34px;
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
                    line-height: 34px;
                    font-weight: 700;
                    cursor: pointer;
                }

                .vjs-quality-button {
                    position: relative;
                }

                .vjs-quality-button.is-hd:before {
                    color: #e53935;
                }

                .vjs-source-button {
                    position: relative;
                }

                .vjs-source-button:before {
                    font-size: 1.8em;
                    line-height: 34px;
                    cursor: pointer;
                }

                .vjs-quality-menu {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 50%;
                    transform: translateX(-50%);
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 10px;
                    background: rgba(9, 9, 11, 0.95);
                    color: #fff;
                    padding: 2px;
                    min-width: 78px;
                    font-size: 10px;
                    z-index: 999;
                    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.7);
                    text-align: center;
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                }

                .vjs-quality-menu div {
                    border-radius: 6px;
                    padding: 3px 7px;
                    line-height: 1.2;
                    cursor: pointer;
                    transition: background-color 0.16s ease, color 0.16s ease;
                }

                .vjs-quality-menu div:hover {
                    background: rgba(255, 255, 255, 0.1);
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
