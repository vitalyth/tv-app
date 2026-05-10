"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { Cast, X, Radio, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import videojs from "video.js"
import "videojs-contrib-dash"
import { type Channel } from "@/lib/channels-data"
import { channelService } from "@/lib/services/channel-service"
import { api } from "@/lib/api"
import ProgramDisplay from "@/components/program-display"
import { useCurrentProgram } from "@/hooks/useCurrentProgram"
import { useGoogleCast } from "@/hooks/useGoogleCast"
import CustomPlayerControls from "@/components/custom-player-controls"
import "@/styles/video-player.css"

if (!(videojs as any).getPlugin?.("qualityLevels")) {
  require("videojs-contrib-quality-levels")
}

const OVERLAY_HIDE_DELAY = 3000 // ms

interface VideoPlayerProps {
  channel: Channel | null
  onClose: () => void
  onResize?: () => void
  className?: string
}

export function VideoPlayer({
  channel,
  onClose,
  onResize,
  className,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreExpandedAfterFullscreenRef = useRef(false)

  const suppressCastVolumeSyncRef = useRef(false)
  const isCastingRef = useRef(false)
  const setCastVolumeRef = useRef<
    (volume: number, muted: boolean) => Promise<void> | void
  >(() => undefined)

  const [playerInstance, setPlayerInstance] = useState<any>(null)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const currentProgram = useCurrentProgram(channel?.programs)

  // Clear any pending hide timer
  const clearOverlayTimer = useCallback(() => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }
  }, [])

  // Show overlay and start auto-hide timer
  const showControls = useCallback(() => {
    setShowOverlay(true)
    clearOverlayTimer()

    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false)
    }, OVERLAY_HIDE_DELAY)
  }, [clearOverlayTimer])

  // Hide overlay immediately and cancel timer
  const hideControls = useCallback(() => {
    clearOverlayTimer()
    setShowOverlay(false)
  }, [clearOverlayTimer])

  // Keep overlay visible while user is interacting (hover/touch)
  const keepControlsVisible = useCallback(() => {
    clearOverlayTimer()
    setShowOverlay(true)
  }, [clearOverlayTimer])

  // Toggle overlay and restart timer if showing
  const toggleControls = useCallback(() => {
    setShowOverlay((prev) => {
      if (prev) {
        clearOverlayTimer()
        return false
      }
      // Show and start timer
      clearOverlayTimer()
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false)
      }, OVERLAY_HIDE_DELAY)
      return true
    })
  }, [clearOverlayTimer])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearOverlayTimer()
  }, [clearOverlayTimer])

  const resetViewMode = useCallback(() => {
    setIsExpanded(false)
    setIsFullscreen(document.fullscreenElement === containerRef.current)
    showControls()
  }, [showControls])

  const toggleExpanded = useCallback(() => {
    if (document.fullscreenElement) return

    setIsExpanded((value) => !value)
    showControls()

    if (onResize) {
      onResize()
    }
  }, [onResize, showControls])

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        // Remember whether we were browser-expanded before entering real fullscreen.
        // This fixes the Expand icon/state after exiting fullscreen.
        restoreExpandedAfterFullscreenRef.current = isExpanded

        setIsExpanded(false)
        await container.requestFullscreen()
      }

      showControls()
    } catch (error) {
      console.warn("Fullscreen failed:", error)
    }
  }, [isExpanded, showControls])

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

    try {
      const seekable = player.seekable?.()
      if (seekable && seekable.length > 0) {
        const liveEdge = seekable.end(seekable.length - 1)
        if (Number.isFinite(liveEdge)) {
          player.currentTime(Math.max(0, liveEdge - 0.5))
        }
      }
    } catch {
      // ignore seek fallback errors
    }

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
    const handleFullscreenChange = () => {
      const fullscreenActive = document.fullscreenElement === containerRef.current

      setIsFullscreen(fullscreenActive)

      if (fullscreenActive) {
        // While real fullscreen is active, browser-expanded mode should be visually disabled.
        setIsExpanded(false)
      } else {
        // If the user entered fullscreen while already in browser-expanded mode,
        // restore browser-expanded mode when leaving fullscreen.
        setIsExpanded(restoreExpandedAfterFullscreenRef.current)
        restoreExpandedAfterFullscreenRef.current = false
      }

      showControls()
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange as EventListener)
    }
  }, [showControls])

  useEffect(() => {
    if (!channel) return

    let isMounted = true

    setIsLoading(true)
    setHasError(false)
    setStreamUrl(null)
    setPlayerInstance(null)
    restoreExpandedAfterFullscreenRef.current = false
    setIsExpanded(false)
    showControls()

    channelService
      .getLiveChannel(channel)
      .then((data: { stream: string }) => {
        if (!isMounted) return
        setStreamUrl(data.stream)
      })
      .catch((err) => {
        if (!isMounted) return
        console.error("Failed to load stream:", err)
        setHasError(true)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [channel])

  useEffect(() => {
    if (!streamUrl) return
    if (!channel || !videoRef.current) return

    setHasError(false)
    setIsLoading(true)
    setIsExpanded(false)
    showControls()

    if (playerRef.current) {
      playerRef.current.dispose()
      playerRef.current = null
      setPlayerInstance(null)

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
      controls: false,
      responsive: true,
      muted: keepLocalPaused,
      playsinline: true,
      liveui: false,
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
          src: api(
            `/proxy?url=${encodeURIComponent(
              streamUrl
            )}&referer=${encodeURIComponent(referer)}`
          ),
          type: isDash ? "application/dash+xml" : "application/x-mpegURL",
        },
      ],
    })

    player.ready(() => {
      resetViewMode()

      if (isCastingRef.current) {
        pauseLocalPlayerForCasting(player)
        return
      }

      const playPromise = player.play()

      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.log("Autoplay blocked")
        })
      }
    })

    player.on("loadstart", () => {
      setIsExpanded(false)
      showControls()
    })

    player.on("loadedmetadata", () => {
      setIsExpanded(false)
      showControls()
    })

    player.on("playing", () => {
      if (isCastingRef.current) {
        pauseLocalPlayerForCasting(player)
        return
      }

      setIsLoading(false)
      setHasError(false)
      showControls()
    })

    player.on("error", () => {
      setHasError(true)
      setIsLoading(false)
      setIsExpanded(false)
    })

    player.on("waiting", () => {
      setIsLoading(true)
    })

    player.on("volumechange", () => {
      if (!isCastingRef.current || suppressCastVolumeSyncRef.current) return

      setCastVolumeRef.current(player.volume() ?? 1, player.muted() ?? false)
    })

    playerRef.current = player
    setPlayerInstance(player)

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose()
        playerRef.current = null
        setPlayerInstance(null)
      }
    }
  }, [streamUrl, channel, pauseLocalPlayerForCasting, resetViewMode, showControls])

  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isDisposed?.() || !isCasting) return

    pauseLocalPlayerForCasting(player)
  }, [isCasting, pauseLocalPlayerForCasting])

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    }

    restoreExpandedAfterFullscreenRef.current = false
    setIsExpanded(false)
    clearOverlayTimer()

    if (!isCastingRef.current) {
      onClose()
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
      ref={containerRef}
      data-player-root
      className={`
        relative overflow-hidden bg-black
        ${isExpanded && !isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : "rounded-xl"}
        ${className || ""}
      `}
      onMouseMove={showControls}
      onMouseLeave={hideControls}
      onTouchStart={showControls}
    >
      {/* Top overlay — channel info + close */}
      <div
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={keepControlsVisible}
        className={`
          absolute top-0 left-0 right-0 z-50 p-3 sm:p-4
          bg-linear-to-b from-black/80 to-transparent
          flex items-center justify-between gap-2
          transition-opacity duration-300
          ${showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            <img src={`/ch/${channel.logo}`} alt={channel.name} />
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate text-sm sm:text-base">
              {channel.name}
            </h3>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>

              <span className="text-xs text-white/90 truncate">
                <ProgramDisplay
                  program={currentProgram || channel.programs?.[0]}
                />
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {isCastAvailable && (
            <Button
              variant="ghost"
              size="icon"
              onClick={isCasting ? stopCasting : requestCastSession}
              disabled={isCastConnecting || !streamUrl}
              className={`text-white hover:bg-white/20 h-9 w-9 ${
                isCasting ? "text-primary" : ""
              }`}
              title={isCasting ? "Stop casting" : "Cast"}
            >
              <Cast className="w-5 h-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white hover:bg-white/20 h-9 w-9"
            title="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="relative w-full h-full bg-black" onClick={toggleControls} dir="ltr">
        <div
          data-vjs-player
          className={`absolute inset-0 ${isCasting ? "opacity-0 pointer-events-none" : ""}`}
        >
          <div ref={videoRef} className="video-js-container w-full h-full" />
        </div>

        {isCasting && !isCastConnecting ? (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/90 px-4 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Channel logo */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 p-2.5 sm:h-20 sm:w-20">
              <img
                src={`/ch/${channel.logo}`}
                alt={channel.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Cast icon + label */}
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <Cast className="h-3.5 w-3.5" />
              <span>מנוגן בטלויזיה</span>
            </div>

            {/* Channel name */}
            <p className="max-w-[200px] truncate text-center text-base font-semibold sm:text-lg">
              {channel.name}
            </p>

            {/* Program */}
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <span className="truncate max-w-[180px]">
                <ProgramDisplay program={currentProgram || channel.programs?.[0]} />
              </span>
            </div>

            {/* Stop casting button */}
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                stopCasting()
              }}
              disabled={isCastConnecting}
              className="mt-1 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
            >
              עצור שידור
            </Button>
          </div>
        ) : (
          <CustomPlayerControls
            player={playerInstance}
            show={showOverlay}
            isExpanded={isExpanded && !isFullscreen}
            isFullscreen={isFullscreen}
            isCasting={isCasting}
            onToggleExpanded={toggleExpanded}
            onToggleFullscreen={toggleFullscreen}
            onInteraction={keepControlsVisible}
          />
        )}
      </div>

      {isLoading && !hasError && !isCasting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse overflow-hidden">
              <img src={`/ch/${channel.logo}`} alt={channel.name} />
            </div>
            <p className="text-white">טוען את הערוץ...</p>
          </div>
        </div>
      )}

      {hasError && !isCasting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center space-y-4 p-6">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>

            <div>
              <p className="text-white text-lg font-medium">
                לא ניתן לטעון את הערוץ
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                הזרם אינו זמין כרגע או שכתובת ה-URL אינה תקינה
              </p>
            </div>

            <Button variant="outline" onClick={handleClose} className="mt-4">
              חזרה לרשימת הערוצים
            </Button>
          </div>
        </div>
      )}

      <style jsx global>{`
        :fullscreen {
          width: 100vw !important;
          height: 100vh !important;
          border-radius: 0 !important;
          background: black;
        }

        :-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          border-radius: 0 !important;
          background: black;
        }

        :fullscreen .video-js-container,
        :fullscreen .video-js,
        :fullscreen video,
        :-webkit-full-screen .video-js-container,
        :-webkit-full-screen .video-js,
        :-webkit-full-screen video {
          width: 100% !important;
          height: 100% !important;
        }

        .video-js-container,
        .video-js,
        .video-js video {
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  )
}
