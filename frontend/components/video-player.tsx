"use client"

import { useRef, useEffect, useState } from "react"
import { X, Radio, AlertCircle } from "lucide-react"
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

export function VideoPlayer({ channel, onClose, onResize, className }: VideoPlayerProps) {
    const videoRef = useRef<HTMLDivElement>(null)
    const playerRef = useRef<any>(null)
    const [hasError, setHasError] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [showOverlay, setShowOverlay] = useState(true);
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
        const isDash = channel?.linkDetails?.manifest_type === 'mpd';
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
        }
    }, [])

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
                top-0 left-0 right-0 z-10 p-4 
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
                    {/* Close button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
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

            {/* Loading state */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
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
