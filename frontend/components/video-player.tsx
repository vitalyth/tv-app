"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { X, Radio, AlertCircle, Cast, Airplay } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import videojs from "video.js"
//import type Player from "video.js/dist/types/player"
import "video.js/dist/video-js.css"
import "videojs-contrib-dash"
//import "videojs-contrib-quality-levels"
import { type Channel } from "@/lib/channels-data"
import { channelService } from "@/lib/services/channel-service";
import { api } from "@/lib/api";
import ProgramDisplay from "@/components/program-display"

if (!(videojs as any).getPlugin?.("qualityLevels")) {
  require("videojs-contrib-quality-levels")
}

interface VideoPlayerProps {
  channel: Channel | null
  onClose: () => void
}

function addQualitySelector(player: any) {
  const Button = videojs.getComponent("Button") as any

  class QualityButton extends Button {
    menu: HTMLDivElement
    handleDocumentClick: (e: MouseEvent) => void

    constructor(player: any, options: any) {
      super(player, options)

      this.controlText("Quality")
      this.addClass("vjs-quality-button")

      // Create menu container
      this.menu = document.createElement("div")
      this.menu.className = "vjs-quality-menu hidden"
      player.el().appendChild(this.menu)

      // Bind and register outside click handler
      this.handleDocumentClick = this.onDocumentClick.bind(this)
      document.addEventListener("click", this.handleDocumentClick)

      this.updateMenu()
    }

    // Toggle menu visibility
    handleClick(event?: Event) {
      event?.stopPropagation()
      this.menu.classList.toggle("hidden")
    }

    // Close menu when clicking outside
    onDocumentClick(e: MouseEvent) {
      const target = e.target as Node

      const clickedInsideMenu = this.menu.contains(target)
      const clickedButton = this.el().contains(target)

      if (!clickedInsideMenu && !clickedButton) {
        this.menu.classList.add("hidden")
      }
    }

    // Cleanup listeners
    dispose() {
      document.removeEventListener("click", this.handleDocumentClick)
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

      item.onclick = () => {
        onClick()
        this.updateMenu()
        this.handleClick()
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
      this.el().setAttribute(
        "data-quality",
        this.getQualityLabel(currentHeight)
      )

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

  player.controlBar.addChild(
    "QualityButton",
    {},
    player.controlBar.children().length - 1
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

export function VideoPlayer({ channel, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCasting, setIsCasting] = useState(false)
  const [castAvailable, setCastAvailable] = useState(false)
  const [airplayAvailable, setAirplayAvailable] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false)

  const showControls = () => {
    setShowOverlay(true)

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
    }

    if (isHoveringRef.current) return

    hideTimeoutRef.current = setTimeout(() => {
      setShowOverlay(false)
    }, 3000)
  }

  // Check for casting availability
  useEffect(() => {
    // Check for Chromecast
    const checkChromecast = () => {
      if (typeof window !== "undefined" && (window as unknown as { chrome?: { cast?: unknown } }).chrome?.cast) {
        setCastAvailable(true)
      }
    }

    // Check for AirPlay (Safari)
    const checkAirplay = () => {
      if (typeof window !== "undefined") {
        const video = document.createElement("video")
        if ((video as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: unknown }).webkitShowPlaybackTargetPicker) {
          setAirplayAvailable(true)
        }
      }
    }

    checkChromecast()
    checkAirplay()

    // Listen for Chromecast availability
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      setCastAvailable(isAvailable)
    }
  }, [])

  // Handle AirPlay
  const handleAirPlay = useCallback(() => {
    const videoElement = videoRef.current?.querySelector("video")
    if (videoElement && (videoElement as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void }).webkitShowPlaybackTargetPicker) {
      (videoElement as HTMLVideoElement & { webkitShowPlaybackTargetPicker: () => void }).webkitShowPlaybackTargetPicker()
    }
  }, [])

  // Handle Chromecast / Remote playback
  const handleCast = useCallback(async () => {
    const videoElement = videoRef.current?.querySelector("video")
    if (!videoElement || !channel) return

    // Try using Remote Playback API first (works on many browsers)
    if ("remote" in videoElement) {
      try {
        const remote = (videoElement as HTMLVideoElement & { remote: { prompt: () => Promise<void> } }).remote
        await remote.prompt()
        setIsCasting(true)
      } catch {
        // User cancelled or no device available
        setIsCasting(false)
      }
    }
  }, [channel])

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


  useEffect( () => {
    console.log('load player', channel);
    if (!streamUrl) return;
    if (!channel || !videoRef.current) return

    setHasError(false)
    setIsLoading(true)
    setIsReady(false)

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
      liveui: true,
      playbackRates: [0.5, 1, 1.5, 2],
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
      setIsReady(true)
      addQualitySelector(player)
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
      className="relative rounded-xl overflow-hidden bg-black"
      onMouseEnter={() => {
        isHoveringRef.current = true
        showControls()
      }}
      onMouseLeave={() => {
        isHoveringRef.current = false
        showControls() // countdown start
      }}
      onClick={showControls}
    >
      {/* Header with channel info and close button */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between transition-opacity duration-300 ${showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-lg"><img src={`/ch/${channel.logo}`} /></span>
          </div>
          <div>
            <h3 className="font-semibold text-white">{channel.name}</h3>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-xs"><ProgramDisplay program={channel.programs?.[0]} /></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* AirPlay button (Safari) */}
          {airplayAvailable && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleAirPlay}
                    className="text-white hover:bg-white/20"
                  >
                    <Airplay className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AirPlay</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Cast button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCast}
                  className={`text-white hover:bg-white/20 ${isCasting ? "text-primary" : ""}`}
                >
                  <Cast className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isCasting ? "מנתק Cast" : "Cast למכשיר"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

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
      <div className="relative w-full h-[70vh] bg-black">
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
        .video-js,
        .video-js-container
        .video-js video {
          width: 100% !important;
          height: 100% !important;
        }
        
        .video-js {
          font-family: inherit;
        }
        
        .video-js .vjs-control-bar {
          background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
          height: 4em;
          padding-top: 1em;
        }
        
        .video-js .vjs-big-play-button {
          background-color: var(--primary, #e54d2e);
          border: none;
          border-radius: 50%;
          width: 80px;
          height: 80px;
          line-height: 80px;
          font-size: 3em;
          transition: transform 0.2s;
        }
        
        .video-js .vjs-big-play-button:hover {
          background-color: var(--primary, #e54d2e);
          transform: scale(1.1);
        }
        
        .video-js .vjs-play-progress,
        .video-js .vjs-volume-level {
          background-color: var(--primary, #e54d2e);
        }
        
        .video-js .vjs-slider {
          background-color: rgba(255, 255, 255, 0.3);
        }
        
        .video-js .vjs-load-progress {
          background-color: rgba(255, 255, 255, 0.2);
        }
        
        .video-js .vjs-time-control {
          display: flex;
          align-items: center;
          padding: 0 0.5em;
        }
        
        .video-js .vjs-live-control {
          display: flex;
          align-items: center;
        }
        
        .video-js .vjs-live-control .vjs-live-display {
          color: var(--primary, #e54d2e);
        }
        
        .video-js .vjs-button > .vjs-icon-placeholder:before {
          font-size: 1.8em;
          line-height: 1.8;
        }
        
        .video-js .vjs-fullscreen-control {
          order: 99;
        }
        
        .video-js.vjs-fullscreen .vjs-control-bar {
          height: 5em;
          padding-top: 1.5em;
        }
        
        .vjs-poster {
          background-size: cover;
        }

        .vjs-quality-button:before {
          content: attr(data-quality); /* SD / HD / 4K */
          font-size: 11px;
          font-weight: 600;
        }

        .vjs-quality-menu {
          position: absolute;
          bottom: 30px;
          right: 18px;
          background: rgba(56, 54, 54, 0.75);
          color: #fff;
          padding: 6px 0;
          min-width: 80px;
          font-size: 11px;
          z-index: 999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          text-align: center;
        }

        .vjs-quality-menu div {
          padding: 6px 12px;
          cursor: pointer;
        }

        .vjs-quality-menu div:hover {
          background: rgba(255,255,255,0.08);
        }

        .vjs-quality-menu .active {
          color: #272727;
          background-color: #FFF;
        }

        .vjs-quality-menu .active:hover {
          color: #272727;
          background-color: #bbbbbbd6;
        }
      `}</style>
    </div>
  )
}
