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
  const [isLiveStream, setIsLiveStream] = useState(true)
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true)
  const [showSeekTooltip, setShowSeekTooltip] = useState(false)

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

  const updateProgress = () => {
    if (!player || player.isDisposed?.()) return

    const playerDuration = player.duration?.() ?? 0
    const playerCurrentTime = player.currentTime?.() ?? 0
    const liveTrackerLive = player.liveTracker?.isLive?.()
    const hasFiniteDuration = isFiniteVodDuration(playerDuration)

    let nextSeekStart = 0
    let nextSeekEnd = hasFiniteDuration ? playerDuration : 0

    try {
      const seekable = player.seekable?.()

      if (seekable && seekable.length > 0) {
        nextSeekStart = seekable.start(0)
        nextSeekEnd = seekable.end(seekable.length - 1)
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

    setSeekStart(safeSeekStart)
    setSeekEnd(safeSeekEnd)
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

    player.on("play", updateState)
    player.on("pause", updateState)
    player.on("volumechange", updateState)
    player.on("loadedmetadata", updateState)
    player.on("durationchange", updateState)
    player.on("timeupdate", updateProgress)
    player.on("progress", updateProgress)

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
      player.off("timeupdate", updateProgress)
      player.off("progress", updateProgress)
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

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className={`
        absolute bottom-0 left-0 right-0 z-30
        bg-linear-to-t from-black/95 via-black/65 to-transparent
        px-1.5 sm:px-4 pt-10 sm:pt-12 pb-2.5 sm:pb-4
        transition-all duration-300
        ${show
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
        }
      `}
    >
      <div className="flex items-center gap-1 sm:gap-3 text-white">
        <div className="flex items-center gap-0.5 sm:gap-2 min-w-0 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </Button>

          <div
            className="relative z-30"
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
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  h-40 w-12
                  flex flex-col items-center justify-center gap-2
                  bg-[rgba(56,54,54,0.85)]
                  backdrop-blur-md
                  shadow-[0_8px_24px_rgba(0,0,0,0.55)]
                  border border-white/10
                  rounded-md
                  z-30
                "
                onMouseEnter={keepMenusOpen}
                onMouseLeave={closeMenusWithDelay}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  className="accent-white h-24 w-24 rotate-[90deg]"
                />

                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleMute()
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white hover:bg-white/20"
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

          {isLiveStream && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goLive}
              className={`gap-1 px-1.5 sm:px-2 h-8 sm:h-9 shrink-0 ${
                isAtLiveEdge
                  ? "text-red-500 hover:text-red-400 hover:bg-red-500/20"
                  : "text-white hover:text-white hover:bg-white/20"
              }`}
              title="Go live"
            >
              <span className="relative flex h-2.5 w-2.5">
                {isAtLiveEdge && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isAtLiveEdge ? "bg-red-500" : "bg-white"
                  }`}
                />
              </span>
              <span className="hidden xs:inline sm:inline font-semibold text-xs sm:text-sm">
                Live
              </span>
            </Button>
          )}
        </div>

        {seekEnd > seekStart && (
          <div className="mx-1 sm:mx-2 flex h-8 sm:h-9 min-w-0 flex-1 items-center" dir="ltr">
            <div className="relative flex h-full w-full items-center">
              {(() => {
                const clampedTime = Math.min(Math.max(currentTime, seekStart), seekEnd)
                const progress =
                  ((clampedTime - seekStart) / Math.max(0.001, seekEnd - seekStart)) * 100
                const tooltipText = isLiveStream
                  ? `-${formatTime(Math.max(0, seekEnd - currentTime))}`
                  : formatTime(currentTime)

                return (
                  <>
                    {showSeekTooltip && (
                      <div
                        className="
                          pointer-events-none absolute -top-5
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

                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-white/35" />

                    <div
                      className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
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
                      onMouseEnter={() => setShowSeekTooltip(true)}
                      onMouseLeave={() => setShowSeekTooltip(false)}
                      onFocus={() => setShowSeekTooltip(true)}
                      onBlur={() => setShowSeekTooltip(false)}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setShowSeekTooltip(true)
                      }}
                      onPointerUp={() => setShowSeekTooltip(false)}
                      onClick={(event) => event.stopPropagation()}
                      className="
                        relative z-10 h-8 sm:h-9 w-full min-w-16 cursor-pointer
                        appearance-none bg-transparent opacity-0
                      "
                      title="Seek"
                    />
                  </>
                )
              })()}
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          <div
            className="relative z-30"
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
                ${qualityLabel === "HD" ? "text-red-500" : "text-white"}
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
                  min-w-24 py-1
                  bg-[rgba(56,54,54,0.85)]
                  backdrop-blur-md
                  text-white text-[11px] text-center
                  shadow-[0_8px_24px_rgba(0,0,0,0.55)]
                  border border-white/10
                  rounded-md
                  overflow-hidden
                  z-30
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
                    px-3 py-1.5 cursor-pointer hover:bg-white/10
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
                      px-3 py-1.5 cursor-pointer hover:bg-white/10
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
