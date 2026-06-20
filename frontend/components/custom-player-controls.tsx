"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  Volume,
  VolumeX,
  Maximize,
  Minimize,
  Cast,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Channel, type Program } from "@/lib/channels-data";
import ProgramDisplay from "@/components/program-display";

const PLAYER_VOLUME_STORAGE_KEY = "tv-player-volume-state";

const getPlayerImageSrc = (logo?: string) => {
  if (!logo) return "/ch/vod.jpg";
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  return `/ch/${logo}`;
};

type TopControlsVisibility = {
  showChannelInfo?: boolean;
  showCast?: boolean;
  showClose?: boolean;
};

type BottomControlsVisibility = {
  showPlay?: boolean;
  showSeek?: boolean;
  showTime?: boolean;
  showVolume?: boolean;
  showLive?: boolean;
  showQuality?: boolean;
  showCast?: boolean;
  showExpand?: boolean;
  showFullscreen?: boolean;
};

interface CustomPlayerControlsProps {
  player: any;
  channel?: Channel | null;
  currentProgram?: Program | null;
  show: boolean;
  isExpanded: boolean;
  isFullscreen: boolean;
  isCasting?: boolean;
  isCastAvailable?: boolean;
  canCast?: boolean;
  isCastConnecting?: boolean;
  isMobileDevice?: boolean;
  onCast?: () => void;
  onClose?: () => void;
  onToggleExpanded?: () => void;
  onToggleFullscreen?: () => void;
  onInteraction?: () => void; // Called on hover/click to keep overlay alive
  topControls?: TopControlsVisibility;
  bottomControls?: BottomControlsVisibility;
}

export default function CustomPlayerControls({
  player,
  channel,
  currentProgram,
  show,
  isExpanded,
  isFullscreen,
  isCasting,
  isCastAvailable,
  canCast = true,
  isCastConnecting,
  isMobileDevice = false,
  onCast,
  onClose,
  onToggleExpanded,
  onToggleFullscreen,
  onInteraction,
  topControls,
  bottomControls,
}: CustomPlayerControlsProps) {
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const qualityButtonRef = useRef<HTMLButtonElement>(null);
  const volumeMenuRef = useRef<HTMLDivElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didRestoreVolumeRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [levels, setLevels] = useState<any[]>([]);
  const [qualityLabel, setQualityLabel] = useState("SD");
  const [autoLabel, setAutoLabel] = useState("Auto");
  const [autoMode, setAutoMode] = useState(true);
  const [selectedQualityKey, setSelectedQualityKey] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekStart, setSeekStart] = useState(0);
  const [seekEnd, setSeekEnd] = useState(0);
  const [liveEdgeWallClockSec, setLiveEdgeWallClockSec] = useState<
    number | null
  >(null);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(true);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);
  const [showSeekTooltip, setShowSeekTooltip] = useState(false);
  const [seekActive, setSeekActive] = useState(false);
  const [seekHoverPercent, setSeekHoverPercent] = useState<number | null>(null);
  const [seekHoverTime, setSeekHoverTime] = useState<number | null>(null);

  const clearCloseMenusTimer = () => {
    if (closeMenusTimerRef.current) {
      clearTimeout(closeMenusTimerRef.current);
      closeMenusTimerRef.current = null;
    }
  };

  const closeMenusWithDelay = () => {
    clearCloseMenusTimer();

    closeMenusTimerRef.current = setTimeout(() => {
      setQualityOpen(false);
      setVolumeOpen(false);
    }, 250);
  };

  const keepMenusOpen = () => {
    clearCloseMenusTimer();
  };

  const saveVolumeState = (nextVolume: number, nextMuted: boolean) => {
    if (isMobileDevice || typeof window === "undefined") return;

    try {
      localStorage.setItem(
        PLAYER_VOLUME_STORAGE_KEY,
        JSON.stringify({
          volume: Math.min(1, Math.max(0, nextVolume)),
          muted: nextMuted,
        }),
      );
    } catch {
      // Ignore localStorage write errors.
    }
  };

  const restoreVolumeState = () => {
    if (isMobileDevice || !player || player.isDisposed?.() || typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        volume?: unknown;
        muted?: unknown;
      };

      if (typeof parsed.volume === "number" && Number.isFinite(parsed.volume)) {
        player.volume(Math.min(1, Math.max(0, parsed.volume)));
      }

      if (typeof parsed.muted === "boolean") {
        player.muted(parsed.muted);
      }
    } catch {
      // Ignore invalid localStorage values.
    }
  };

  useEffect(() => {
    return () => clearCloseMenusTimer();
  }, []);

  useEffect(() => {
    if (!qualityOpen && !volumeOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      const clickedQualityMenu = qualityMenuRef.current?.contains(target);
      const clickedQualityButton = qualityButtonRef.current?.contains(target);
      const clickedVolumeMenu = volumeMenuRef.current?.contains(target);
      const clickedVolumeButton = volumeButtonRef.current?.contains(target);

      if (
        !clickedQualityMenu &&
        !clickedQualityButton &&
        !clickedVolumeMenu &&
        !clickedVolumeButton
      ) {
        setQualityOpen(false);
        setVolumeOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [qualityOpen, volumeOpen]);

  const isAuto = (qLevels: any) => {
    for (let i = 0; i < qLevels.length; i++) {
      if (!qLevels[i].enabled) return false;
    }
    return true;
  };

  const getLevelBitrate = (level: any): number | null => {
    const bitrate = Number(level?.bitrate || level?.bandwidth || level?.attributes?.BANDWIDTH);
    return Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null;
  };

  const getLevelKey = (level: any) => {
    if (level?.height) return `height:${level.height}`;

    const bitrate = getLevelBitrate(level);
    if (bitrate) return `bitrate:${bitrate}`;

    return null;
  };

  const getCurrentLevel = (qLevels: any): any | null => {
    const index = qLevels.selectedIndex;
    if (index === -1) return null;
    return qLevels[index] || null;
  };

  const getQualityLabel = (height: number | null) => {
    if (!height) return "SD";
    if (height >= 2160) return "4K";
    if (height >= 1080) return "FHD";
    if (height >= 720) return "HD";
    return "SD";
  };

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1_000_000) {
      const mbps = bitrate / 1_000_000;
      return `${mbps >= 10 ? Math.round(mbps) : mbps.toFixed(1)}M`;
    }

    return `${Math.round(bitrate / 1000)}K`;
  };

  const getLevelLabel = (level: any) => {
    if (level?.height) return `${level.height}p`;

    const bitrate = getLevelBitrate(level);
    if (bitrate) return formatBitrate(bitrate);

    return "Unknown";
  };

  const getButtonQualityLabel = (level: any | null) => {
    if (!level) return "SD";
    if (level.height) return getQualityLabel(level.height);

    const bitrate = getLevelBitrate(level);
    return bitrate ? formatBitrate(bitrate) : "SD";
  };

  const getUniqueLevels = (qLevels: any) => {
    const map = new Map<string, any>();

    for (let i = 0; i < qLevels.length; i++) {
      const level = qLevels[i];
      const key = getLevelKey(level);

      if (key && !map.has(key)) {
        map.set(key, level);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aHeight = a.height || 0;
      const bHeight = b.height || 0;

      if (aHeight || bHeight) return bHeight - aHeight;

      return (getLevelBitrate(b) || 0) - (getLevelBitrate(a) || 0);
    });
  };

  const isFiniteVodDuration = (value: number) => {
    return Number.isFinite(value) && value > 0;
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const formatClockTime = (unixSeconds: number) => {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "";

    return new Date(unixSeconds * 1000).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const getLiveClockTime = (time: number) => {
    if (!isLiveStream || liveEdgeWallClockSec === null || seekEnd <= seekStart) {
      return null;
    }

    const secondsBehindLiveEdge = Math.max(0, seekEnd - time);
    return formatClockTime(liveEdgeWallClockSec - secondsBehindLiveEdge);
  };

  const getSeekPercent = (time: number) => {
    if (seekEnd <= seekStart) return 0;

    return Math.min(
      100,
      Math.max(
        0,
        ((time - seekStart) / Math.max(0.001, seekEnd - seekStart)) * 100,
      ),
    );
  };

  const getTimeFromPointerEvent = (
    event:
      | React.PointerEvent<HTMLInputElement>
      | React.MouseEvent<HTMLInputElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const percent = rect.width > 0 ? x / rect.width : 0;
    const time = seekStart + percent * Math.max(0, seekEnd - seekStart);

    setSeekHoverPercent(percent * 100);
    setSeekHoverTime(time);
  };

  const getSeekTooltipText = (time: number) => {
    if (isLiveStream) {
      return (
        getLiveClockTime(time) ??
        `-${formatTime(Math.max(0, seekEnd - time))}`
      );
    }

    return formatTime(time);
  };

  const getDisplayStartTime = () => {
    if (isLiveStream) {
      return (
        getLiveClockTime(seekStart) ??
        `-${formatTime(Math.max(0, seekEnd - seekStart))}`
      );
    }

    return formatTime(0);
  };

  const getDisplayEndTime = () => {
    if (isLiveStream) return "";
    return formatTime(duration);
  };

  const getTimeDisplayText = () => {
    if (isLiveStream) {
      const startClockTime = getLiveClockTime(seekStart);
      const currentClockTime = getLiveClockTime(
        Math.min(Math.max(currentTime, seekStart), seekEnd),
      );

      if (startClockTime && currentClockTime) {
        return `${startClockTime} / ${currentClockTime}`;
      }

      return `-${formatTime(Math.max(0, seekEnd - seekStart))} / -${formatTime(Math.max(0, seekEnd - currentTime))}`;
    }

    return `${formatTime(currentTime)} / ${formatTime(duration)}`;
  };

  const updateProgress = () => {
    if (!player || player.isDisposed?.()) return;

    const playerDuration = player.duration?.() ?? 0;
    const playerCurrentTime = player.currentTime?.() ?? 0;
    const liveTrackerLive = player.liveTracker?.isLive?.();
    const hasFiniteDuration = isFiniteVodDuration(playerDuration);

    let nextSeekStart = 0;
    let nextSeekEnd = hasFiniteDuration ? playerDuration : 0;
    let nextBufferedEnd = 0;

    try {
      const seekable = player.seekable?.();

      if (seekable && seekable.length > 0) {
        nextSeekStart = seekable.start(0);
        nextSeekEnd = seekable.end(seekable.length - 1);
      }

      const buffered = player.buffered?.();

      if (buffered && buffered.length > 0) {
        nextBufferedEnd = buffered.end(buffered.length - 1);
      }
    } catch {
      // Ignore seekable read errors.
    }

    const liveMode = liveTrackerLive === true || !hasFiniteDuration;

    const safeSeekStart = Number.isFinite(nextSeekStart) ? nextSeekStart : 0;
    const safeSeekEnd = Number.isFinite(nextSeekEnd) ? nextSeekEnd : 0;
    const safeCurrentTime = Number.isFinite(playerCurrentTime)
      ? playerCurrentTime
      : 0;

    const safeBufferedEnd = Number.isFinite(nextBufferedEnd)
      ? Math.min(Math.max(nextBufferedEnd, safeSeekStart), safeSeekEnd)
      : safeCurrentTime;

    setCurrentTime(safeCurrentTime);
    setDuration(
      hasFiniteDuration
        ? playerDuration
        : Math.max(0, safeSeekEnd - safeSeekStart),
    );
    setSeekStart(safeSeekStart);
    setSeekEnd(safeSeekEnd);
    setLiveEdgeWallClockSec(
      liveMode && safeSeekEnd > safeSeekStart
        ? Date.now() / 1000
        : null,
    );
    setBufferedEnd(safeBufferedEnd);
    setIsLiveStream(liveMode);
    setIsAtLiveEdge(!liveMode || safeSeekEnd - safeCurrentTime <= 2);
  };

  const seekTo = (value: number) => {
    if (!player || player.isDisposed?.()) return;

    const target = Math.min(Math.max(value, seekStart), seekEnd || value);

    player.currentTime(target);
    setCurrentTime(target);
  };

  useEffect(() => {
    didRestoreVolumeRef.current = false;
  }, [player, isMobileDevice]);

  useEffect(() => {
    if (!player || player.isDisposed?.() || isMobileDevice || didRestoreVolumeRef.current) return;

    didRestoreVolumeRef.current = true;
    restoreVolumeState();
  }, [player, isMobileDevice]);

  useEffect(() => {
    if (!player || player.isDisposed?.()) return;

    const updateQuality = () => {
      const qLevels = player.qualityLevels?.();
      if (!qLevels || !qLevels.length) return;

      const currentAutoMode = isAuto(qLevels);
      const currentLevel = getCurrentLevel(qLevels);
      const currentKey = currentLevel ? getLevelKey(currentLevel) : null;

      setLevels(getUniqueLevels(qLevels));
      setQualityLabel(getButtonQualityLabel(currentLevel));
      setAutoMode(currentAutoMode);
      setSelectedQualityKey(currentAutoMode ? null : currentKey);
      setAutoLabel(currentLevel ? `Auto (${getLevelLabel(currentLevel)})` : "Auto");
    };

    const updateState = () => {
      const nextMuted = player.muted();
      const nextVolume = player.volume() ?? 1;

      setIsPlaying(!player.paused());
      setMuted(nextMuted);
      setVolume(nextVolume);
      saveVolumeState(nextVolume, nextMuted);
      updateQuality();
      updateProgress();
    };

    // Throttle timeupdate to 250ms to avoid excessive re-renders
    let lastProgressUpdate = 0;
    const throttledProgress = () => {
      const now = Date.now();
      if (now - lastProgressUpdate < 250) return;
      lastProgressUpdate = now;
      updateProgress();
    };

    player.on("play", updateState);
    player.on("pause", updateState);
    player.on("volumechange", updateState);
    player.on("loadedmetadata", updateState);
    player.on("durationchange", updateState);
    player.on("timeupdate", throttledProgress);
    player.on("progress", throttledProgress);

    const qLevels = player.qualityLevels?.();
    qLevels?.on?.("addqualitylevel", updateQuality);
    qLevels?.on?.("change", updateQuality);

    updateState();

    return () => {
      player.off("play", updateState);
      player.off("pause", updateState);
      player.off("volumechange", updateState);
      player.off("loadedmetadata", updateState);
      player.off("durationchange", updateState);
      player.off("timeupdate", throttledProgress);
      player.off("progress", throttledProgress);
      qLevels?.off?.("addqualitylevel", updateQuality);
      qLevels?.off?.("change", updateQuality);
    };
  }, [player]);

  const togglePlay = () => {
    if (!player || player.isDisposed?.()) return;

    if (player.paused()) {
      player.play()?.catch?.(() => undefined);
    } else {
      player.pause();
    }
  };

  const toggleMute = () => {
    if (!player || player.isDisposed?.()) return;

    const nextMuted = !player.muted();
    const nextVolume = player.volume() ?? volume;

    player.muted(nextMuted);
    saveVolumeState(nextVolume, nextMuted);
  };

  const VolumeIcon = () => {
    if (muted || volume === 0) {
      return <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />;
    }

    if (volume <= 0.25) {
      return <Volume className="w-4 h-4 sm:w-5 sm:h-5" />;
    }

    if (volume <= 0.65) {
      return <Volume1 className="w-4 h-4 sm:w-5 sm:h-5" />;
    }

    return <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />;
  };

  const changeVolume = (value: number) => {
    if (!player || player.isDisposed?.()) return;

    const nextVolume = Math.min(1, Math.max(0, value));
    const nextMuted = nextVolume === 0 ? true : false;

    player.volume(nextVolume);

    if (nextVolume > 0 && player.muted()) {
      player.muted(false);
    }

    if (nextVolume === 0) {
      player.muted(true);
    }

    saveVolumeState(nextVolume, nextMuted);
  };

  const goLive = () => {
    if (!player || player.isDisposed?.()) return;

    try {
      player.liveTracker?.seekToLiveEdge?.();

      const seekable = player.seekable?.();
      if (seekable && seekable.length > 0) {
        const liveEdge = seekable.end(seekable.length - 1);
        if (Number.isFinite(liveEdge)) {
          player.currentTime(Math.max(0, liveEdge - 0.5));
        }
      }

      player.play()?.catch?.(() => undefined);
    } catch {
      player.play()?.catch?.(() => undefined);
    }
  };

  const setAutoQuality = () => {
    const qLevels = player?.qualityLevels?.();
    if (!qLevels) return;

    for (let i = 0; i < qLevels.length; i++) {
      qLevels[i].enabled = true;
    }

    setQualityOpen(false);
  };

  const setManualQuality = (qualityKey: string) => {
    const qLevels = player?.qualityLevels?.();
    if (!qLevels) return;

    for (let i = 0; i < qLevels.length; i++) {
      qLevels[i].enabled = getLevelKey(qLevels[i]) === qualityKey;
    }

    setQualityOpen(false);
  };

  const BrowserExpandIcon = ({ active }: { active: boolean }) => (
    <span
      className={`block h-2.5 w-4 rounded-[2px] border border-current ${active ? "bg-current" : "bg-transparent"
        }`}
    />
  );

  // When casting, show as playing since remote device is playing
  const showAsPlaying = isCasting ? true : isPlaying;

  useEffect(() => {
    if (!isMobileDevice) return;
    setVolumeOpen(false);
  }, [isMobileDevice]);

  const topOptions = {
    showChannelInfo: true,
    showCast: true,
    showClose: true,
    ...topControls,
  };

  const bottomOptions = {
    showPlay: true,
    showSeek: true,
    showTime: true,
    showVolume: true,
    showLive: true,
    showQuality: true,
    showCast: false,
    showExpand: true,
    showFullscreen: true,
    ...bottomControls,
  };

  return (
    <>
      {(topOptions.showChannelInfo ||
        topOptions.showCast ||
        topOptions.showClose) && (
          <div
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={onInteraction}
            onMouseMove={onInteraction}
            className={`
            absolute top-0 left-0 right-0 z-[60]
            bg-linear-to-b from-black/85 via-black/45 to-transparent
            px-3 sm:px-4 pt-3 sm:pt-4 pb-8 sm:pb-10
            transition-opacity duration-300
            ${show ? "opacity-100" : "opacity-0 pointer-events-none"}
          `}
          >
            <div className="flex items-center justify-between gap-2 text-white">

              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {topOptions.showClose && onClose && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-9 w-9 text-white hover:bg-white/20"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}

                {topOptions.showCast && onCast && (canCast || isCastAvailable || isCasting) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCast}
                    disabled={isCastConnecting || !canCast || (!isCastAvailable && !isCasting)}
                    className={`h-9 w-9 text-white hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none ${isCasting ? "text-primary" : ""
                      }`}
                    title={
                      !canCast
                        ? "Cast is not ready"
                        : !isCastAvailable && !isCasting
                          ? "Cast device not available"
                        : isCasting
                          ? "Stop casting"
                          : "Cast"
                    }
                  >
                    <Cast className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {topOptions.showChannelInfo && channel ? (
                <div
                  className="flex min-w-0 items-center gap-2 sm:gap-3"
                  dir="rtl"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 sm:h-10 sm:w-10">
                    <img
                      src={getPlayerImageSrc(channel.playerLogo || channel.logo)}
                      alt={channel.playerTitle || channel.name}
                    />
                  </div>

                  <div className="min-w-0 text-right">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-white sm:text-base">
                      {channel.type === "vod" && channel.vodMeta ? (
                        <>
                          <span className="text-white/75">{channel.vodMeta.channelName}</span>
                          <span className="px-1 text-white/45">·</span>
                          <span>{channel.vodMeta.programName}</span>
                        </>
                      ) : (
                        channel.playerTitle || channel.name
                      )}
                    </h3>

                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-white/90">
                      {channel.type !== "vod" && (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                      )}

                      <span className="truncate">
                        {channel.type === "vod" && channel.vodMeta ? (
                          [channel.vodMeta.seasonName, channel.vodMeta.episodeName]
                            .filter(Boolean)
                            .join(" · ")
                        ) : channel.playerSubtitle ? (
                          channel.playerSubtitle
                        ) : (
                          <ProgramDisplay
                            program={currentProgram || channel.programs?.[0]}
                          />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div />
              )}
            </div>
          </div>
        )}

      <div
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={onInteraction}
        onMouseMove={onInteraction}
        className={`
        absolute bottom-0 left-0 right-0 z-[60]
        bg-linear-to-t from-black/95 via-black/65 to-transparent
        px-2.5 sm:px-4 pt-7 sm:pt-10 pb-2 sm:pb-3
        transition-all duration-300
        ${show
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
          }
      `}
      >
        {bottomOptions.showSeek && seekEnd > seekStart && (
          <div
            className="relative z-[70] mb-0 flex h-6 w-full min-w-0 items-center gap-2 sm:h-7 sm:gap-3"
            dir="ltr"
          >
            <div className="relative flex h-full min-w-0 flex-1 items-center">
              {(() => {
                const clampedTime = Math.min(
                  Math.max(currentTime, seekStart),
                  seekEnd,
                );
                const progress = getSeekPercent(clampedTime);
                const loadedProgress = Math.max(
                  progress,
                  getSeekPercent(bufferedEnd),
                );
                const tooltipPercent = seekHoverPercent ?? progress;
                const tooltipTime = seekHoverTime ?? clampedTime;
                const tooltipText = getSeekTooltipText(tooltipTime);

                return (
                  <>
                    {showSeekTooltip && (
                      <div
                        className="
                          pointer-events-none absolute -top-5 z-[80]
                          rounded bg-black/85 px-1.5 py-0.5
                          text-[10px] leading-none text-white shadow-md
                        "
                        style={{
                          left: `${tooltipPercent}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        {tooltipText}
                      </div>
                    )}

                    <div
                      className={`pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/20 transition-all ${seekActive ? "h-[4px]" : "h-[2px]"
                        }`}
                    />

                    <div
                      className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/45 transition-all ${seekActive ? "h-[4px]" : "h-[2px]"
                        }`}
                      style={{ width: `${loadedProgress}%` }}
                    />

                    <div
                      className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-red-500 transition-all ${seekActive ? "h-[4px]" : "h-[2px]"
                        }`}
                      style={{ width: `${progress}%` }}
                    />

                    <div
                      className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-white bg-red-500 shadow transition-all ${seekActive ? "h-3 w-3 border-2" : "h-1.5 w-1.5 border"
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
                      onMouseEnter={(event) => {
                        getTimeFromPointerEvent(event);
                        setShowSeekTooltip(true);
                        setSeekActive(true);
                      }}
                      onMouseMove={getTimeFromPointerEvent}
                      onMouseLeave={() => {
                        setShowSeekTooltip(false);
                        setSeekActive(false);
                        setSeekHoverPercent(null);
                        setSeekHoverTime(null);
                      }}
                      onFocus={() => {
                        setShowSeekTooltip(true);
                        setSeekActive(true);
                      }}
                      onBlur={() => {
                        setShowSeekTooltip(false);
                        setSeekActive(false);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        getTimeFromPointerEvent(event);
                        setShowSeekTooltip(true);
                        setSeekActive(true);
                      }}
                      onPointerMove={getTimeFromPointerEvent}
                      onPointerUp={() => {
                        setShowSeekTooltip(false);
                        setSeekActive(false);
                        setSeekHoverPercent(null);
                        setSeekHoverTime(null);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="
                        relative z-[70] h-8 w-full min-w-16 cursor-pointer
                        appearance-none bg-transparent opacity-0 sm:h-9
                      "
                      title="Seek"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-3 text-white">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0 shrink-0">
            {bottomOptions.showPlay && (
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
            )}

            {bottomOptions.showVolume && !isMobileDevice && (
              <div
                className="relative z-[70] flex items-center gap-1.5 sm:gap-2"
                onMouseEnter={() => {
                  keepMenusOpen();
                  setVolumeOpen(true);
                  setQualityOpen(false);
                }}
                onMouseLeave={closeMenusWithDelay}
              >
                <Button
                  ref={volumeButtonRef}
                  variant="ghost"
                  size="icon"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleMute();
                    setQualityOpen(false);
                  }}
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                  title="Volume"
                >
                  {VolumeIcon()}
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
                    z-[80]
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
                      onChange={(event) =>
                        changeVolume(Number(event.target.value))
                      }
                      className="h-1 w-20 cursor-pointer accent-red-500 sm:w-24 md:w-28"
                      title="Volume"
                    />
                  </div>
                )}
              </div>
            )}

            {bottomOptions.showTime && seekEnd > seekStart && (
              <span className="hidden min-[420px]:inline-flex shrink-0 items-center text-[10px] text-white/80 tabular-nums sm:text-xs">
                {getTimeDisplayText()}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-2 shrink-0">
            {bottomOptions.showLive && isLiveStream && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  goLive();
                }}
                className={`h-8 px-1 text-[10px] font-semibold leading-none transition-colors sm:h-9 sm:px-1.5 ${isAtLiveEdge
                    ? "text-red-500 hover:text-red-400"
                    : "text-white/85 hover:text-white"
                  }`}
                title="Go live"
              >
                LIVE
              </button>
            )}

            {bottomOptions.showQuality && (
              <div
                className="relative z-[70]"
                onMouseEnter={() => {
                  keepMenusOpen();
                  setQualityOpen(true);
                  setVolumeOpen(false);
                }}
                onMouseLeave={closeMenusWithDelay}
              >
                <button
                  ref={qualityButtonRef}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setQualityOpen((value) => !value);
                    setVolumeOpen(false);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  className={`
                h-8 sm:h-9 min-w-7 sm:min-w-8 px-1 rounded-md
                text-[0.7rem] sm:text-[0.8rem] leading-none font-semibold
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
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-1
                  min-w-16 py-0.5 sm:min-w-18
                  bg-[rgba(56,54,54,0.85)]
                  backdrop-blur-md
                  text-white text-[9px] text-center
                  shadow-[0_8px_24px_rgba(0,0,0,0.55)]
                  border border-white/10
                  rounded-md
                  overflow-hidden
                  z-[80]
                "
                    onMouseEnter={keepMenusOpen}
                    onMouseLeave={closeMenusWithDelay}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setAutoQuality();
                      }}
                      className={`
                    px-2 py-1 sm:py-0.5 cursor-pointer hover:bg-white/10
                    ${autoMode ? "bg-white text-[#272727] hover:bg-[#bbbbbbd6]" : ""}
                  `}
                    >
                      {autoLabel}
                    </div>

                    {levels.map((level) => {
                      const qualityKey = getLevelKey(level);
                      if (!qualityKey) return null;

                      return (
                        <div
                          key={qualityKey}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setManualQuality(qualityKey);
                          }}
                          className={`
                        px-2 py-1 sm:py-0.5 cursor-pointer hover:bg-white/10
                        ${qualityKey === selectedQualityKey
                              ? "bg-white text-[#272727] hover:bg-[#bbbbbbd6]"
                              : ""
                            }
                      `}
                        >
                          {getLevelLabel(level)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {bottomOptions.showCast && onCast && (canCast || isCastAvailable || isCasting) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCast}
                disabled={isCastConnecting || !canCast || (!isCastAvailable && !isCasting)}
                className={`text-white hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${isCasting ? "text-primary" : ""
                  }`}
                title={
                  !canCast
                    ? "Cast is not ready"
                    : !isCastAvailable && !isCasting
                      ? "Cast device not available"
                    : isCasting
                      ? "Stop casting"
                      : "Cast"
                }
              >
                <Cast className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            )}

            {bottomOptions.showExpand && onToggleExpanded && (
              <div className="hidden lg:block">
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
                  <BrowserExpandIcon active={isExpanded && !isFullscreen} />
                </Button>
              </div>
            )}

            {bottomOptions.showFullscreen && onToggleFullscreen && (
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
    </>
  );
}
