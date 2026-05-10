"use client"

import { useEffect, useRef, useState } from "react"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Expand,
  Shrink,
  Cast,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface CustomPlayerControlsProps {
  player: any
  show: boolean
  isExpanded: boolean
  isFullscreen: boolean
  isCasting?: boolean
  isCastAvailable?: boolean
  isCastConnecting?: boolean
  onCast?: () => void
  onToggleExpanded?: () => void
  onToggleFullscreen?: () => void
  onInteraction?: () => void  // Called on hover/click to keep overlay alive
}

export default function CustomPlayerControls({
  player,
  show,
  isExpanded,
  isFullscreen,
  isCasting,
  isCastAvailable,
  isCastConnecting,
  onCast,
  onToggleExpanded,
  onToggleFullscreen,
  onInteraction,
}: CustomPlayerControlsProps) {
  const qualityMenuRef = useRef<HTMLDivElement>(null)
  const qualityButtonRef = useRef<HTMLButtonElement>(null)
  const volumeMenuRef = useRef<HTMLDivElement>(null)
  const volumeButtonRef = useRef<HTMLButtonElement>(null)
  const closeMenusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [levels, setLevels] = useState<any[]>([])
  const [qualityLabel, setQualityLabel] = useState("SD")
  const [autoLabel, setAutoLabel] = useState("Auto")
  const [autoMode, setAutoMode] = useState(true)
  const [selectedHeight, setSelectedHeight] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seekStart, setSeekStart] = useState(0)
  const [seekEnd, setSeekEnd] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [isLiveStream, setIsLiveStream] = useState(true)
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true)
  const [showSeekTooltip, setShowSeekTooltip] = useState(false)
  const [seekActive, setSeekActive] = useState(false)

  const clearCloseMenusTimer = () => {
    if (closeMenusTimerRef.current) {
      clearTimeout(closeMenusTimerRef.current)
      closeMenusTimerRef.current = null
    }
  }

  const closeMenusWithDelay = () => {
    clearCloseMenusTimer()

    closeMenusTimerRef.current = setTimeout(() => {
      setQualityOpen(false)
      setVolumeOpen(false)
    }, 250)
  }

  const keepMenusOpen = () => {
    clearCloseMenusTimer()
  }

  useEffect(() => {
    return () => clearCloseMenusTimer()
  }, [])

  useEffect(() => {
    if (!qualityOpen && !volumeOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      const clickedQualityMenu = qualityMenuRef.current?.contains(target)
      const clickedQualityButton = qualityButtonRef.current?.contains(target)
      const clickedVolumeMenu = volumeMenuRef.current?.contains(target)
      const clickedVolumeButton = volumeButtonRef.current?.contains(target)

      if (
        !clickedQualityMenu &&
        !clickedQualityButton &&
        !clickedVolumeMenu &&
        !clickedVolumeButton
      ) {
        setQualityOpen(false)
        setVolumeOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [qualityOpen, volumeOpen])

  const isAuto = (qLevels: any) => {
    for (let i = 0; i < qLevels.length; i++) {
      if (!qLevels[i].enabled) return false
    }
    return true
  }

  const getCurrentHeight = (qLevels: any): number | null => {
    const index = qLevels.selectedIndex
    if (index === -1) return null
    return qLevels[index]?.height || null
  }

  const getQualityLabel = (height: number | null) => {
    if (!height) return "SD"
    if (height >= 2160) return "4K"
    if (height >= 1080) return "FHD"
    if (height >= 720) return "HD"
    return "SD"
  }

  const getUniqueLevels = (qLevels: any) => {
    const map = new Map<number, any>()

    for (let i = 0; i < qLevels.length; i++) {
      const level = qLevels[i]
      if (level.height && !map.has(level.height)) {
        map.set(level.height, level)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.height - a.height)
  }

  const isFiniteVodDuration = (value: number) => {
    return Number.isFinite(value) && value > 0
  }

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00"

    const totalSeconds = Math.floor(seconds)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`
  }

  const getSeekPercent = (time: number) => {
    if (seekEnd <= seekStart) return 0

    return Math.min(
      100,
      Math.max(0, ((time - seekStart) / Math.max(0.001, seekEnd - seekStart)) * 100)
    )
  }

  const getDisplayStartTime = () => {
    if (isLiveStream) {
      return `-${formatTime(Math.max(0, seekEnd - seekStart))}`
    }

    return formatTime(0)
  }

  const getDisplayEndTime = () => {
    if (isLiveStream) return ""
    return formatTime(duration)
  }

  const updateProgress = () => {
    if (!player || player.isDisposed?.()) return

    const playerDuration = player.duration?.() ?? 0
    const playerCurrentTime = player.currentTime?.() ?? 0
    const liveTrackerLive = player.liveTracker?.isLive?.()
    const hasFiniteDuration = isFiniteVodDuration(playerDuration)

    let nextSeekStart = 0
    let nextSeekEnd = hasFiniteDuration ? playerDuration : 0
    let nextBufferedEnd = 0

    try {
      const seekable = player.seekable?.()

      if (seekable && seekable.length > 0) {
        nextSeekStart = seekable.start(0)
        nextSeekEnd = seekable.end(seekable.length - 1)
      }

      const buffered = player.buffered?.()

      if (buffered && buffered.length > 0) {
        nextBufferedEnd = buffered.end(buffered.length - 1)
      }
    } catch {
      // Ignore seekable read errors.
    }

    const liveMode = liveTrackerLive === true || !hasFiniteDuration

    setCurrentTime(Number.isFinite(playerCurrentTime) ? playerCurrentTime : 0)
    setDuration(hasFiniteDuration ? playerDuration : Math.max(0, nextSeekEnd - nextSeekStart))
    const safeSeekStart = Number.isFinite(nextSeekStart) ? nextSeekStart : 0
    const safeSeekEnd = Number.isFinite(nextSeekEnd) ? nextSeekEnd : 0
    const safeCurrentTime = Number.isFinite(playerCurrentTime) ? playerCurrentTime : 0

    const safeBufferedEnd = Number.isFinite(nextBufferedEnd)
      ? Math.min(Math.max(nextBufferedEnd, safeSeekStart), safeSeekEnd)
      : safeCurrentTime

    setSeekStart(safeSeekStart)
    setSeekEnd(safeSeekEnd)
    setBufferedEnd(safeBufferedEnd)
    setIsLiveStream(liveMode)
    setIsAtLiveEdge(!liveMode || safeSeekEnd - safeCurrentTime <= 2)
  }

  const seekTo = (value: number) => {
    if (!player || player.isDisposed?.()) return

    const target = Math.min(Math.max(value, seekStart), seekEnd || value)

    player.currentTime(target)
    setCurrentTime(target)
  }

  useEffect(() => {
    if (!player || player.isDisposed?.()) return

    const updateQuality = () => {
      const qLevels = player.qualityLevels?.()
      if (!qLevels || !qLevels.length) return

      const currentAutoMode = isAuto(qLevels)
      const currentHeight = getCurrentHeight(qLevels)
      const label = getQualityLabel(currentHeight)

      setLevels(getUniqueLevels(qLevels))
      setQualityLabel(label)
      setAutoMode(currentAutoMode)
      setSelectedHeight(currentAutoMode ? null : currentHeight)
      setAutoLabel(currentHeight ? `Auto (${currentHeight}p)` : "Auto")
    }

    const updateState = () => {
      setIsPlaying(!player.paused())
      setMuted(player.muted())
      setVolume(player.volume() ?? 1)
      updateQuality()
      updateProgress()
    }

    // Throttle timeupdate to 250ms to avoid excessive re-renders
    let lastProgressUpdate = 0
    const throttledProgress = () => {
      const now = Date.now()
      if (now - lastProgressUpdate < 250) return
      lastProgressUpdate = now
      updateProgress()
    }

    player.on("play", updateState)
    player.on("pause", updateState)
    player.on("volumechange", updateState)
    player.on("loadedmetadata", updateState)
    player.on("durationchange", updateState)
    player.on("timeupdate", throttledProgress)
    player.on("progress", throttledProgress)

    const qLevels = player.qualityLevels?.()
    qLevels?.on?.("addqualitylevel", updateQuality)
    qLevels?.on?.("change", updateQuality)

    updateState()

    return () => {
      player.off("play", updateState)
      player.off("pause", updateState)
      player.off("volumechange", updateState)
      player.off("loadedmetadata", updateState)
      player.off("durationchange", updateState)
      player.off("timeupdate", throttledProgress)
      player.off("progress", throttledProgress)
      qLevels?.off?.("addqualitylevel", updateQuality)
      qLevels?.off?.("change", updateQuality)
    }
  }, [player])

  const togglePlay = () => {
    if (!player || player.isDisposed?.()) return

    if (player.paused()) {
      player.play()?.catch?.(() => undefined)
    } else {
      player.pause()
    }
  }

  const toggleMute = () => {
    if (!player || player.isDisposed?.()) return
    player.muted(!player.muted())
  }

  const changeVolume = (value: number) => {
    if (!player || player.isDisposed?.()) return

    player.volume(value)

    if (value > 0 && player.muted()) {
      player.muted(false)
    }

    if (value === 0) {
      player.muted(true)
    }
  }

  const goLive = () => {
    if (!player || player.isDisposed?.()) return

    try {
      player.liveTracker?.seekToLiveEdge?.()

      const seekable = player.seekable?.()
      if (seekable && seekable.length > 0) {
        const liveEdge = seekable.end(seekable.length - 1)
        if (Number.isFinite(liveEdge)) {
          player.currentTime(Math.max(0, liveEdge - 0.5))
        }
      }

      player.play()?.catch?.(() => undefined)
    } catch {
      player.play()?.catch?.(() => undefined)
    }
  }

  const setAutoQuality = () => {
    const qLevels = player?.qualityLevels?.()
    if (!qLevels) return

    for (let i = 0; i < qLevels.length; i++) {
      qLevels[i].enabled = true
    }

    setQualityOpen(false)
  }

  const setManualQuality = (height: number) => {
    const qLevels = player?.qualityLevels?.()
    if (!qLevels) return

    for (let i = 0; i < qLevels.length; i++) {
      qLevels[i].enabled = qLevels[i].height === height
    }

    setQualityOpen(false)
  }

  // When casting, show as playing since remote device is playing
  const showAsPlaying = isCasting ? true : isPlaying

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={onInteraction}
      onMouseMove={onInteraction}
      className={`
        absolute bottom-0 left-0 right-0 z-50
        bg-linear-to-t from-black/95 via-black/65 to-transparent
        px-2.5 sm:px-4 pt-7 sm:pt-10 pb-2 sm:pb-3
        transition-all duration-300
        ${show
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
        }
      `}
    >
      {seekEnd > seekStart && (
        <div
          className="relative z-50 mb-[1px] flex h-7 w-full min-w-0 items-center gap-4 sm:h-8 sm:gap-5"
          dir="ltr"
        >
            <span className="w-12 shrink-0 text-[11px] text-white/85 tabular-nums sm:w-14 sm:text-xs">
              {getDisplayStartTime()}
            </span>

            <div className="relative flex h-full min-w-0 flex-1 items-center">
              {(() => {
                const clampedTime = Math.min(Math.max(currentTime, seekStart), seekEnd)
                const progress = getSeekPercent(clampedTime)
                const loadedProgress = Math.max(progress, getSeekPercent(bufferedEnd))
                const tooltipText = isLiveStream
                  ? `-${formatTime(Math.max(0, seekEnd - currentTime))}`
                  : formatTime(currentTime)

                return (
                  <>
                    {showSeekTooltip && (
                      <div
                        className="
                          pointer-events-none absolute -top-5 z-50
                          rounded bg-black/85 px-1.5 py-0.5
                          text-[10px] leading-none text-white shadow-md
                        "
                        style={{
                          left: `${progress}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        {tooltipText}
                      </div>
                    )}

                    <div
                      className={`pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/20 transition-all ${
                        seekActive ? "h-[4px]" : "h-[2px]"
                      }`}
                    />

                    <div
                      className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/45 transition-all ${
                        seekActive ? "h-[4px]" : "h-[2px]"
                      }`}
                      style={{ width: `${loadedProgress}%` }}
                    />

                    <div
                      className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-red-500 transition-all ${
                        seekActive ? "h-[4px]" : "h-[2px]"
                      }`}
                      style={{ width: `${progress}%` }}
                    />

                    <div
                      className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-white bg-red-500 shadow transition-all ${
                        seekActive ? "h-3 w-3 border-2" : "h-1.5 w-1.5 border"
                      }`}
                      style={{ left: `${progress}%` }}
                    />

                    <input
                      type="range"
                      dir="ltr"
                      min={seekStart}
                      max={seekEnd}
                      step={0.1}
                      value={clampedTime}
                      onChange={(event) => seekTo(Number(event.target.value))}
                      onMouseEnter={() => {
                        setShowSeekTooltip(true)
                        setSeekActive(true)
                      }}
                      onMouseLeave={() => {
                        setShowSeekTooltip(false)
                        setSeekActive(false)
                      }}
                      onFocus={() => {
                        setShowSeekTooltip(true)
                        setSeekActive(true)
                      }}
                      onBlur={() => {
                        setShowSeekTooltip(false)
                        setSeekActive(false)
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setShowSeekTooltip(true)
                        setSeekActive(true)
                      }}
                      onPointerUp={() => {
                        setShowSeekTooltip(false)
                        setSeekActive(false)
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="
                        relative z-50 h-8 w-full min-w-16 cursor-pointer
                        appearance-none bg-transparent opacity-0 sm:h-9
                      "
                      title="Seek"
                    />
                  </>
                )
              })()}
            </div>

            <div className="flex w-[54px] shrink-0 justify-end sm:w-[62px]">
              {isLiveStream ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    goLive()
                  }}
                  className={`h-6 rounded-md px-2 text-[10px] font-semibold leading-none transition-colors sm:h-7 sm:text-[10px] ${
                    isAtLiveEdge
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-white/15 text-white/85 hover:bg-white/25 hover:text-white"
                  }`}
                  title="Go live"
                >
                  LIVE
                </button>
              ) : (
                <span className="flex h-7 items-center justify-end text-[10px] text-white/75 tabular-nums sm:h-8 sm:text-xs">
                  {getDisplayEndTime()}
                </span>
              )}
            </div>
          </div>
      )}

      <div className="mb-[2px] h-px w-full bg-white/20" />

      <div className="flex items-center gap-1 sm:gap-3 text-white">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            title={showAsPlaying ? "Pause" : "Play"}
          >
            {showAsPlaying ? (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </Button>

          <div
            className="relative z-50 flex items-center gap-1.5 sm:gap-2"
            onMouseEnter={() => {
              keepMenusOpen()
              setVolumeOpen(true)
              setQualityOpen(false)
            }}
            onMouseLeave={closeMenusWithDelay}
          >
            <Button
              ref={volumeButtonRef}
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setVolumeOpen((value) => !value)
                setQualityOpen(false)
              }}
              className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              title="Volume"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>

            {volumeOpen && (
              <div
                ref={volumeMenuRef}
                className="
                  absolute left-full top-1/2 ml-1.5 -translate-y-1/2
                  flex h-8 items-center gap-2 rounded-md
                  bg-black/55 px-2 backdrop-blur-md
                  border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.45)]
                  sm:static sm:ml-0 sm:translate-y-0 sm:bg-transparent sm:px-0 sm:border-0 sm:shadow-none sm:backdrop-blur-0
                  z-50
                "
                onMouseEnter={keepMenusOpen}
                onMouseLeave={closeMenusWithDelay}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  className="h-1 w-20 cursor-pointer accent-red-500 sm:w-24 md:w-28"
                  title="Volume"
                />

                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleMute()
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/20 sm:hidden"
                  title={muted ? "Unmute" : "Mute"}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-2 shrink-0">
          <div
            className="relative z-50"
            onMouseEnter={() => {
              keepMenusOpen()
              setQualityOpen(true)
              setVolumeOpen(false)
            }}
            onMouseLeave={closeMenusWithDelay}
          >
            <button
              ref={qualityButtonRef}
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setQualityOpen((value) => !value)
                setVolumeOpen(false)
              }}
              className={`
                h-8 sm:h-9 min-w-8 sm:min-w-9 px-1 sm:px-1.5 rounded-md
                text-[0.8rem] sm:text-[0.95rem] leading-none font-semibold
                hover:bg-white/20 transition-colors
                ${qualityLabel === "HD" || qualityLabel === "FHD" ? "text-red-500" : "text-white"}
              `}
              title="Quality"
            >
              {qualityLabel}
            </button>

            {qualityOpen && (
              <div
                ref={qualityMenuRef}
                className="
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  min-w-28 py-1 sm:min-w-24
                  bg-[rgba(56,54,54,0.85)]
                  backdrop-blur-md
                  text-white text-[11px] text-center
                  shadow-[0_8px_24px_rgba(0,0,0,0.55)]
                  border border-white/10
                  rounded-md
                  overflow-hidden
                  z-50
                "
                onMouseEnter={keepMenusOpen}
                onMouseLeave={closeMenusWithDelay}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setAutoQuality()
                  }}
                  className={`
                    px-3 py-2 sm:py-1.5 cursor-pointer hover:bg-white/10
                    ${autoMode ? "bg-white text-[#272727] hover:bg-[#bbbbbbd6]" : ""}
                  `}
                >
                  {autoLabel}
                </div>

                {levels.map((level) => (
                  <div
                    key={level.height}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setManualQuality(level.height)
                    }}
                    className={`
                      px-3 py-2 sm:py-1.5 cursor-pointer hover:bg-white/10
                      ${level.height === selectedHeight
                        ? "bg-white text-[#272727] hover:bg-[#bbbbbbd6]"
                        : ""
                      }
                    `}
                  >
                    {level.height}p
                  </div>
                ))}
              </div>
            )}
          </div>

          {isCastAvailable && onCast && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCast}
              disabled={isCastConnecting}
              className={`text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${isCasting ? "text-primary" : ""
                }`}
              title={isCasting ? "Stop casting" : "Cast"}
            >
              <Cast className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          )}

          {onToggleExpanded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleExpanded}
              disabled={isFullscreen || !player || player.isDisposed?.()}
              className="text-white hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              title={
                isFullscreen
                  ? "Exit fullscreen first"
                  : isExpanded
                    ? "Exit browser expanded mode"
                    : "Expand in browser"
              }
            >
              {isExpanded && !isFullscreen ? (
                <Shrink className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Expand className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>
          )}

          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullscreen}
              className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
