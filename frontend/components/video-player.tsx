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
import type Player from "video.js/dist/types/player"
import "video.js/dist/video-js.css"

const api = (path: any) => {
  console.log('=====process.env.NEXT_PUBLIC_API_BASE======', process.env.NEXT_PUBLIC_API_BASE);
  return `${process.env.NEXT_PUBLIC_API_BASE || ""}${path}`;
}

type ManifestType = "hls" | "mpd"

interface LinkDetails {
  link: string
  referer?: string
  final?: boolean
  manifest_type?: ManifestType
  ch?: string
  regex?: string
}

interface Channel {
  id: string
  name: string
  logo: string
  category: string
  streamUrl: string

  channelID: string
  module: string
  mode: number
  linkDetails: LinkDetails
}

interface VideoPlayerProps {
  channel: Channel | null
  onClose: () => void
}

export function VideoPlayer({ channel, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCasting, setIsCasting] = useState(false)
  const [castAvailable, setCastAvailable] = useState(false)
  const [airplayAvailable, setAirplayAvailable] = useState(false)
  const [streamUrl, setStreamUrl] = useState(null);

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

  useEffect( () => {
    if (!channel) return;

    setIsLoading(true);
    async function fetchData() {
      const res = await fetch(api("/live_channel"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(channel), // 👈 שולח את כל האובייקט
      });

      const data = await res.json();
      console.log("stream URL:", data.stream);
      setStreamUrl(data.stream);
    }

    fetchData();
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
    videoElement.classList.add("vjs-big-play-centered", "vjs-fluid")
    videoRef.current.appendChild(videoElement)

    const referer = channel.linkDetails?.referer || ""

    const player = videojs(videoElement, {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      liveui: true,
      playbackRates: [0.5, 1, 1.5, 2],
      html5: {
        vhs: {
          overrideNative: true,
          //withCredentials: true,
          withCredentials: false,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      sources: [
        {
          src: api(`/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(referer)}`),
          type: "application/x-mpegURL",
        },
      ],
    })

    player.on("ready", () => {
      setIsReady(true)
    })

    player.on("playing", () => {
      setIsLoading(false)
      setHasError(false)
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
    <div className="relative rounded-xl overflow-hidden bg-black">
      {/* Header with channel info and close button */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
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
              <span className="text-xs text-primary">LIVE</span>
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
      <div data-vjs-player>
        <div ref={videoRef} className="video-js-container" />
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
        .video-js-container {
          width: 100%;
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
      `}</style>
    </div>
  )
}
