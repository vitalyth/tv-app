"use client";

import { useCallback, useRef, useEffect, useLayoutEffect, useState } from "react";
import { Cast, Radio, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import videojs from "video.js";
import "videojs-contrib-dash";
import { type Channel } from "@/lib/channels-data";
import { channelService } from "@/lib/services/channel-service";
import { api } from "@/lib/api";
import ProgramDisplay from "@/components/program-display";
import { useCurrentProgram } from "@/hooks/useCurrentProgram";
import { useGoogleCast } from "@/hooks/useGoogleCast";
import { useMobileDevice } from "@/hooks/use-mobile-device";
import CustomPlayerControls from "@/components/custom-player-controls";
import { getVodProgress, saveVodProgress } from "@/lib/vod-progress";
import { type DockedCastControl } from "@/context/player-context";
import { getDetailImageSrc } from "@/lib/image-urls";
import "@/styles/video-player.css";

if (!(videojs as any).getPlugin?.("qualityLevels")) {
  require("videojs-contrib-quality-levels");
}

const OVERLAY_HIDE_DELAY = 3000; // ms
const VOD_PROGRESS_SAVE_INTERVAL_MS = 5000;
const VOD_PROGRESS_END_THRESHOLD_SECONDS = 30;
const PLAYBACK_RECOVERY_DELAY_MS = 8000;
const PLAYBACK_RELOAD_AFTER_ATTEMPTS = 2;
const PLAYBACK_LOADING_DELAY_MS = 1200;
const VOD_BUFFER_WATCH_INTERVAL_MS = 2000;
const VOD_LOW_BUFFER_SECONDS = 12;
const VOD_BUFFER_STALL_MS = 8000;
const VOD_AUTO_NEXT_THRESHOLD_SECONDS = 2;
const VOD_AUTO_NEXT_NOTICE_SECONDS = 20;

const getPlayerImageSrc = (logo?: string) => {
  return getDetailImageSrc(logo) || "/ch/vod.jpg";
};

const shouldUseVpnProxy = (channel: Channel) => {
  const channelId = channel.channelID || channel.id || "";
  return (
    channel.linkDetails?.vpn ||
    channel.module === "kan-vod" ||
    channel.module === "reshet-vod" ||
    channelId.startsWith("ch_11")
  );
};

type IOSFullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

interface VideoPlayerProps {
  channel: Channel | null;
  onClose: () => void;
  onEnded?: () => void;
  autoNextLabel?: string | null;
  onCancelAutoNext?: () => void;
  className?: string;
  hideTopControls?: boolean;
  onCastControlChange?: (control: DockedCastControl | null) => void;
}

export function VideoPlayer({
  channel,
  onClose,
  onEnded,
  autoNextLabel,
  onCancelAutoNext,
  className,
  hideTopControls = false,
  onCastControlChange,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inlineHostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreExpandedAfterFullscreenRef = useRef(false);
  const lastVodProgressSaveRef = useRef(0);
  const preCastMutedRef = useRef(false);
  const preCastVolumeRef = useRef(1);
  const onEndedRef = useRef(onEnded);
  const autoNextLabelRef = useRef(autoNextLabel);

  const suppressCastVolumeSyncRef = useRef(false);
  const isCastingRef = useRef(false);
  const setCastVolumeRef = useRef<
    (volume: number, muted: boolean) => Promise<void> | void
  >(() => undefined);

  const [playerInstance, setPlayerInstance] = useState<any>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamChannelId, setStreamChannelId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const shouldHideTopControls = hideTopControls && !isExpanded && !isFullscreen;

  onEndedRef.current = onEnded;
  autoNextLabelRef.current = autoNextLabel;

  const { isMobileDevice, isPhoneLike, isTouchDevice } = useMobileDevice();
  const currentProgram = useCurrentProgram(channel?.programs);
  const activeStreamUrl = channel && streamChannelId === channel.id ? streamUrl : null;
  const loadingImage =
    channel?.type === "vod"
      ? channel.vodMeta?.programImage || channel.vodMeta?.episodeImage || channel.playerLogo || channel.logo
      : channel?.logo;
  const loadingTitle =
    channel?.type === "vod"
      ? channel.vodMeta?.episodeName || channel.playerSubtitle || channel.name
      : channel?.name;
  const loadingMessage =
    channel?.type === "vod"
      ? "טוען את הפרק..."
      : "טוען את הערוץ...";

  const setPlayerLoading = useCallback((value: boolean) => {
    setIsLoading((current) => (current === value ? current : value));
  }, []);

  useLayoutEffect(() => {
    const node = containerRef.current;
    const inlineHost = inlineHostRef.current;
    if (!node || !inlineHost) return;

    const shouldPortalToBody = isExpanded && !isFullscreen;

    if (shouldPortalToBody) {
      if (node.parentElement !== document.body) {
        document.body.appendChild(node);
      }
    } else if (node.parentElement !== inlineHost) {
      inlineHost.appendChild(node);
    }

    return () => {
      if (node.parentElement !== document.body) return;

      if (inlineHost.isConnected) {
        inlineHost.appendChild(node);
      } else {
        node.remove();
      }
    };
  }, [isExpanded, isFullscreen]);

  // Clear any pending hide timer
  const clearOverlayTimer = useCallback(() => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
  }, []);

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  // Show overlay and start auto-hide timer
  const showControls = useCallback(() => {
    setShowOverlay(true);
    clearOverlayTimer();

    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, OVERLAY_HIDE_DELAY);
  }, [clearOverlayTimer]);

  // Hide overlay immediately and cancel timer
  const hideControls = useCallback(() => {
    clearOverlayTimer();
    setShowOverlay(false);
  }, [clearOverlayTimer]);

  // Keep overlay visible while user is interacting (hover/touch)
  const keepControlsVisible = useCallback(() => {
    clearOverlayTimer();
    setShowOverlay(true);
  }, [clearOverlayTimer]);

  // Toggle overlay and restart timer if showing
  const toggleControls = useCallback(() => {
    setShowOverlay((prev) => {
      if (prev) {
        clearOverlayTimer();
        return false;
      }
      // Show and start timer
      clearOverlayTimer();
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
      }, OVERLAY_HIDE_DELAY);
      return true;
    });
  }, [clearOverlayTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearOverlayTimer();
      clearLoadingTimer();
    };
  }, [clearLoadingTimer, clearOverlayTimer]);

  const resetViewMode = useCallback(() => {
    setIsExpanded(false);
    setIsFullscreen(document.fullscreenElement === containerRef.current);
    showControls();
  }, [showControls]);

  const toggleExpanded = useCallback(() => {
    if (document.fullscreenElement) return;

    setIsExpanded((value) => !value);
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (isPhoneLike) {
        const videoElement = playerRef.current?.el?.()?.querySelector?.("video") as IOSFullscreenVideo | null;

        if (videoElement?.webkitEnterFullscreen) {
          if (videoElement.webkitDisplayingFullscreen && videoElement.webkitExitFullscreen) {
            videoElement.webkitExitFullscreen();
            setIsFullscreen(false);
          } else {
            videoElement.webkitEnterFullscreen();
            setIsFullscreen(true);
            setIsExpanded(false);
          }

          showControls();
          return;
        }
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        // Remember whether we were browser-expanded before entering real fullscreen.
        // This fixes the Expand icon/state after exiting fullscreen.
        restoreExpandedAfterFullscreenRef.current = isExpanded;

        setIsExpanded(false);
        await container.requestFullscreen();
      }

      showControls();
    } catch (error) {
      console.warn("Fullscreen failed:", error);
    }
  }, [isExpanded, isPhoneLike, showControls]);

  const handlePlayerDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (document.fullscreenElement === containerRef.current) return;

    if (isExpanded) {
      toggleFullscreen();
      return;
    }

    toggleExpanded();
  }, [isExpanded, toggleExpanded, toggleFullscreen]);

  const pauseLocalPlayerForCasting = useCallback((player: any) => {
    if (!player || player.isDisposed?.()) return;

    suppressCastVolumeSyncRef.current = true;
    preCastMutedRef.current = player.muted?.() ?? false;
    preCastVolumeRef.current = player.volume?.() ?? 1;
    player.pause();
    player.muted(true);
    setPlayerLoading(false);

    window.setTimeout(() => {
      suppressCastVolumeSyncRef.current = false;
    }, 0);
  }, []);

  const handleCastStarted = useCallback(() => {
    pauseLocalPlayerForCasting(playerRef.current);
  }, [pauseLocalPlayerForCasting]);

  const handleCastEnded = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed?.() || !channel) return;

    suppressCastVolumeSyncRef.current = true;;
    player.volume(preCastVolumeRef.current);
    player.muted(preCastMutedRef.current);
    
    if (channel.type === "vod") {
      const progress = getVodProgress(channel.id);
      const resumeTime = progress?.currentTime ?? 0;

      if (resumeTime > 0) {
        player.currentTime(resumeTime);
      }
    } else {
      (player as any).liveTracker?.seekToLiveEdge?.();

      try {
        const seekable = player.seekable?.();
        if (seekable && seekable.length > 0) {
          const liveEdge = seekable.end(seekable.length - 1);
          if (Number.isFinite(liveEdge)) {
            player.currentTime(Math.max(0, liveEdge - 0.5));
          }
        }
      } catch {
        // ignore seek fallback errors
      }
    }

    player.play()?.catch?.(() => undefined);

    window.setTimeout(() => {
      suppressCastVolumeSyncRef.current = false;
    }, 0);
  }, [channel]);

  const {
    deviceName,
    isAvailable: isCastAvailable,
    isCasting,
    isConnecting: isCastConnecting,
    requestCastSession,
    setVolume: setCastVolume,
    stopCasting,
  } = useGoogleCast({
    channel,
    streamUrl: activeStreamUrl,
    programName: currentProgram?.name,
    onCastStarted: handleCastStarted,
    onCastEnded: handleCastEnded,
  });

  useEffect(() => {
    isCastingRef.current = isCasting;
    setCastVolumeRef.current = setCastVolume;
  }, [isCasting, setCastVolume]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenActive =
        document.fullscreenElement === containerRef.current;

      setIsFullscreen(fullscreenActive);

      if (fullscreenActive) {
        // While real fullscreen is active, browser-expanded mode should be visually disabled.
        setIsExpanded(false);
      } else {
        // If the user entered fullscreen while already in browser-expanded mode,
        // restore browser-expanded mode when leaving fullscreen.
        setIsExpanded(restoreExpandedAfterFullscreenRef.current);
        restoreExpandedAfterFullscreenRef.current = false;
      }

      showControls();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange as EventListener,
    );

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange as EventListener,
      );
    };
  }, [showControls]);

  useEffect(() => {
    if (!isPhoneLike || !playerInstance || playerInstance.isDisposed?.()) return;

    const videoElement = playerInstance.el?.()?.querySelector?.("video") as IOSFullscreenVideo | null;
    if (!videoElement) return;

    const handleIOSFullscreenBegin = () => {
      setIsFullscreen(true);
      setIsExpanded(false);
      showControls();
    };

    const handleIOSFullscreenEnd = () => {
      setIsFullscreen(false);
      restoreExpandedAfterFullscreenRef.current = false;
      showControls();
    };

    videoElement.addEventListener("webkitbeginfullscreen", handleIOSFullscreenBegin as EventListener);
    videoElement.addEventListener("webkitendfullscreen", handleIOSFullscreenEnd as EventListener);

    return () => {
      videoElement.removeEventListener("webkitbeginfullscreen", handleIOSFullscreenBegin as EventListener);
      videoElement.removeEventListener("webkitendfullscreen", handleIOSFullscreenEnd as EventListener);
    };
  }, [isPhoneLike, playerInstance, showControls]);

  useEffect(() => {
    if (!channel) return;

    let isMounted = true;

    setPlayerLoading(true);
    setHasError(false);
    setStreamUrl(null);
    setStreamChannelId(null);
    setPlayerInstance(null);
    restoreExpandedAfterFullscreenRef.current = false;
    lastVodProgressSaveRef.current = 0;
    setIsExpanded(false);
    setAutoNextCountdown(null);
    showControls();

    const streamRequest =
      channel.type === "vod"
        ? channelService.getVodStream(channel)
        : channelService.getLiveChannel(channel);

    streamRequest
      .then((data: { stream: string }) => {
        if (!isMounted) return;
        setStreamChannelId(channel.id);
        setStreamUrl(data.stream);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load stream:", err);
        setHasError(true);
      })
      .finally(() => {
        if (isMounted) setPlayerLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channel]);

  useEffect(() => {
    if (!activeStreamUrl) return;
    if (!channel || !videoRef.current) return;

    setHasError(false);
    setPlayerLoading(true);
    clearLoadingTimer();
    setIsExpanded(false);
    showControls();

    if (isCasting) {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        setPlayerInstance(null);
      }
      setPlayerLoading(false);
      return;
    }

    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
      setPlayerInstance(null);

      if (videoRef.current) {
        videoRef.current.innerHTML = "";
      }
    }

    const videoElement = document.createElement("video-js");
    videoElement.classList.add("vjs-big-play-centered");
    videoRef.current.appendChild(videoElement);

    const referer = channel?.linkDetails?.referer || "";
    const manifestType = channel?.linkDetails?.manifest_type;

    const isDash =
      manifestType === "mpd" ||
      activeStreamUrl.includes("/livedash/") ||
      activeStreamUrl.endsWith(".mpd");

    const isSafari =
      typeof navigator !== "undefined" &&
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    const keepLocalPaused = isCastingRef.current;
    const isLocalSeriesStream = activeStreamUrl.includes("/stream/local-series");
    const isLocalSeriesHls =
      isLocalSeriesStream &&
      (activeStreamUrl.toLowerCase().includes(".m3u8") ||
        channel?.linkDetails?.manifest_type === "hls");

    const useVpnProxy = shouldUseVpnProxy(channel);
    const proxyEndpoint = useVpnProxy ? "/v/proxy" : "/proxy";
    const vpnParam = useVpnProxy ? "&vpn=true" : "";
    const finalStreamUrl = isLocalSeriesStream && !isLocalSeriesHls
      ? activeStreamUrl
      : api(
          `${proxyEndpoint}?url=${encodeURIComponent(
            activeStreamUrl,
          )}&referer=${encodeURIComponent(referer)}${vpnParam}`,
        );

    const sourceType = isLocalSeriesStream && !isLocalSeriesHls
      ? "video/mp4"
      : isDash
        ? "application/dash+xml"
        : "application/x-mpegURL";

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
          enableLowInitialPlaylist: true,
          useBandwidthFromLocalStorage: true,
          useNetworkInformationApi: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      sources: [
        {
          src: finalStreamUrl,
          type: sourceType,
        },
      ],
    });

    (player as any).reloadSourceOnError?.({
      errorInterval: 15,
    });

    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryAttempts = 0;
    let lastBufferedEnd = 0;
    let lastBufferGrowthAt = Date.now();

    const clearRecoveryTimer = () => {
      if (!recoveryTimer) return;
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    };

    const scheduleDelayedLoading = () => {
      if (loadingTimerRef.current || isCastingRef.current) return;

      loadingTimerRef.current = setTimeout(() => {
        loadingTimerRef.current = null;

        if (
          player.isDisposed?.() ||
          isCastingRef.current ||
          player.paused?.() ||
          player.ended?.() ||
          (player.readyState?.() ?? 0) >= 3
        ) {
          return;
        }

        setPlayerLoading(true);
      }, PLAYBACK_LOADING_DELAY_MS);
    };

    const reloadCurrentSource = () => {
      const source = (player as any).currentSource?.();
      if (!source?.src) return;

      const resumeTime = channel.type === "vod" ? player.currentTime?.() ?? 0 : 0;

      player.one("loadedmetadata", () => {
        if (channel.type === "vod" && resumeTime > 0) {
          player.currentTime(resumeTime);
        } else {
          (player as any).liveTracker?.seekToLiveEdge?.();
        }

        player.play()?.catch?.(() => undefined);
      });
      player.src(source);
    };

    const recoverPlayback = () => {
      recoveryTimer = null;

      if (
        player.isDisposed?.() ||
        isCastingRef.current ||
        player.paused?.() ||
        player.ended?.()
      ) {
        return;
      }

      recoveryAttempts += 1;

      if (channel.type !== "vod") {
        (player as any).liveTracker?.seekToLiveEdge?.();
      }

      player.play()?.catch?.(() => undefined);

      if (recoveryAttempts >= PLAYBACK_RELOAD_AFTER_ATTEMPTS) {
        recoveryAttempts = 0;
        reloadCurrentSource();
        return;
      }

      recoveryTimer = setTimeout(recoverPlayback, PLAYBACK_RECOVERY_DELAY_MS);
    };

    const schedulePlaybackRecovery = () => {
      if (
        recoveryTimer ||
        player.paused?.() ||
        isCastingRef.current ||
        (player.readyState?.() ?? 0) >= 3
      ) {
        return;
      }

      recoveryTimer = setTimeout(recoverPlayback, PLAYBACK_RECOVERY_DELAY_MS);
    };

    const getBufferedEnd = () => {
      const currentTime = player.currentTime?.() ?? 0;
      const buffered = player.buffered?.();

      if (!buffered?.length) return currentTime;

      for (let index = 0; index < buffered.length; index += 1) {
        if (
          currentTime >= buffered.start(index) - 0.25 &&
          currentTime <= buffered.end(index) + 0.25
        ) {
          return buffered.end(index);
        }
      }

      return currentTime;
    };

    const getPlaybackEnd = () => {
      const duration = player.duration?.() ?? 0;

      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }

      const seekable = player.seekable?.();
      if (seekable?.length) {
        const seekableEnd = seekable.end(seekable.length - 1);
        return Number.isFinite(seekableEnd) ? seekableEnd : 0;
      }

      return 0;
    };

    const isNearVodEnd = () => {
      const currentTime = player.currentTime?.() ?? 0;
      const playbackEnd = getPlaybackEnd();

      return (
        channel.type === "vod" &&
        playbackEnd > 0 &&
        currentTime > 0 &&
        playbackEnd - currentTime <= VOD_AUTO_NEXT_THRESHOLD_SECONDS
      );
    };

    const monitorVodBuffer = () => {
      if (
        channel.type !== "vod" ||
        player.isDisposed?.() ||
        player.paused?.() ||
        player.ended?.() ||
        player.seeking?.() ||
        isCastingRef.current
      ) {
        lastBufferedEnd = getBufferedEnd();
        lastBufferGrowthAt = Date.now();
        return;
      }

      const now = Date.now();
      const currentTime = player.currentTime?.() ?? 0;
      const duration = player.duration?.() ?? 0;
      const bufferedEnd = getBufferedEnd();
      const bufferAhead = Math.max(0, bufferedEnd - currentTime);
      const nearEnd =
        Number.isFinite(duration) &&
        duration > 0 &&
        duration - currentTime <= VOD_PROGRESS_END_THRESHOLD_SECONDS;

      if (bufferedEnd > lastBufferedEnd + 0.25) {
        lastBufferedEnd = bufferedEnd;
        lastBufferGrowthAt = now;
        clearRecoveryTimer();
        recoveryAttempts = 0;
        return;
      }

      if (
        !nearEnd &&
        bufferAhead <= VOD_LOW_BUFFER_SECONDS &&
        now - lastBufferGrowthAt >= VOD_BUFFER_STALL_MS
      ) {
        lastBufferGrowthAt = now;
        recoverPlayback();
      }
    };

    const vodBufferWatchdog = setInterval(
      monitorVodBuffer,
      VOD_BUFFER_WATCH_INTERVAL_MS,
    );

    player.ready(() => {
      resetViewMode();

      if (isCastingRef.current) {
        pauseLocalPlayerForCasting(player);
        return;
      }

      const playPromise = player.play();

      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.log("Autoplay blocked");
        });
      }
    });

    player.on("loadstart", () => {
      setIsExpanded(false);
      showControls();
    });

    player.on("loadedmetadata", () => {
      setIsExpanded(false);
      if (channel.type === "vod") {
        const resumeTime = channel.resumeTime ?? getVodProgress(channel.id)?.currentTime ?? 0;
        const duration = player.duration?.() ?? 0;
        const canResume =
          resumeTime > 0 &&
          (!Number.isFinite(duration) ||
            duration <= 0 ||
            duration - resumeTime > VOD_PROGRESS_END_THRESHOLD_SECONDS);

        if (canResume) {
          player.currentTime(resumeTime);
        }
      }
      showControls();
    });

    const markPlaybackActive = () => {
      if (player.isDisposed?.() || isCastingRef.current) return;

      clearRecoveryTimer();
      clearLoadingTimer();
      recoveryAttempts = 0;
      setPlayerLoading(false);
    };

    player.on("playing", () => {
      clearRecoveryTimer();
      recoveryAttempts = 0;

      if (isCastingRef.current) {
        pauseLocalPlayerForCasting(player);
        return;
      }

      markPlaybackActive();
      setHasError(false);
      showControls();
    });

    player.on("error", () => {
      clearLoadingTimer();
      setHasError(true);
      setPlayerLoading(false);
      setIsExpanded(false);
    });

    const handlePlaybackInterruption = () => {
      if (onEndedRef.current && isNearVodEnd()) {
        completeVodPlayback();
        return;
      }

      scheduleDelayedLoading();
      schedulePlaybackRecovery();
    };

    player.on("waiting", handlePlaybackInterruption);
    player.on("stalled", handlePlaybackInterruption);
    player.on("canplay", markPlaybackActive);
    player.on("canplaythrough", markPlaybackActive);
    player.on("timeupdate", markPlaybackActive);
    player.on("pause", clearRecoveryTimer);

    player.on("volumechange", () => {
      if (!isCastingRef.current || suppressCastVolumeSyncRef.current) return;

      setCastVolumeRef.current(player.volume() ?? 1, player.muted() ?? false);
    });

    const saveCurrentVodProgress = () => {
      if (channel.type !== "vod" || player.isDisposed?.()) return;
      saveVodProgress(channel.id, player.currentTime?.() ?? 0, player.duration?.() ?? 0);
    };

    let playbackCompletionTriggered = false;

    const completeVodPlayback = () => {
      if (playbackCompletionTriggered || channel.type !== "vod") return;
      playbackCompletionTriggered = true;
      saveCurrentVodProgress();
      onEndedRef.current?.();
    };

    const throttledVodProgressSave = () => {
      const now = Date.now();
      if (now - lastVodProgressSaveRef.current < VOD_PROGRESS_SAVE_INTERVAL_MS) return;
      lastVodProgressSaveRef.current = now;
      saveCurrentVodProgress();
    };

    const handleVodTimeUpdate = () => {
      throttledVodProgressSave();

      if (!onEndedRef.current || player.paused?.() || player.seeking?.() || isCastingRef.current) return;

      const remainingSeconds = getPlaybackEnd() - (player.currentTime?.() ?? 0);
      if (
        autoNextLabelRef.current &&
        remainingSeconds > 0 &&
        remainingSeconds <= VOD_AUTO_NEXT_NOTICE_SECONDS
      ) {
        setAutoNextCountdown(
          Math.min(
            VOD_AUTO_NEXT_NOTICE_SECONDS,
            Math.max(1, Math.ceil(remainingSeconds)),
          ),
        );
      } else {
        setAutoNextCountdown(null);
      }

      if (isNearVodEnd()) {
        completeVodPlayback();
      }
    };

    player.on("timeupdate", handleVodTimeUpdate);
    player.on("pause", saveCurrentVodProgress);
    player.on("ended", completeVodPlayback);

    playerRef.current = player;
    setPlayerInstance(player);

    return () => {
      clearRecoveryTimer();
      clearLoadingTimer();
      clearInterval(vodBufferWatchdog);

      if (playerRef.current && !playerRef.current.isDisposed()) {
        saveCurrentVodProgress();
        playerRef.current.dispose();
        playerRef.current = null;
        setPlayerInstance(null);
      }
    };
  }, [
    activeStreamUrl,
    isCasting,
    channel,
    clearLoadingTimer,
    pauseLocalPlayerForCasting,
    resetViewMode,
    showControls,
    setPlayerLoading,
  ]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed?.() || !isCasting) return;

    pauseLocalPlayerForCasting(player);
  }, [isCasting, pauseLocalPlayerForCasting]);

  useEffect(() => {
    if (!isPhoneLike || !containerRef.current) return;

    const mediaQuery = window.matchMedia("(orientation: landscape)");

    const syncMobileOrientationFullscreen = () => {
      const container = containerRef.current;
      if (!container) return;

      const shouldUseFullscreen = mediaQuery.matches;
      const isThisPlayerFullscreen = document.fullscreenElement === container;

      if (shouldUseFullscreen && !document.fullscreenElement) {
        container.requestFullscreen?.().catch(() => undefined);
        return;
      }

      if (!shouldUseFullscreen && isThisPlayerFullscreen) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };

    syncMobileOrientationFullscreen();
    mediaQuery.addEventListener?.("change", syncMobileOrientationFullscreen);

    return () => {
      mediaQuery.removeEventListener?.(
        "change",
        syncMobileOrientationFullscreen,
      );
    };
  }, [isPhoneLike]);

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }

    restoreExpandedAfterFullscreenRef.current = false;
    setIsExpanded(false);
    clearOverlayTimer();

    if (!isCastingRef.current) {
      onClose();
      return;
    }

    stopCasting().finally(onClose);
  };

  useEffect(() => {
    if (!onCastControlChange) return;

    onCastControlChange({
      canCast: !!activeStreamUrl,
      isAvailable: isCastAvailable,
      isCasting,
      isConnecting: isCastConnecting,
      onCast: isCasting ? stopCasting : requestCastSession,
    });

    return () => onCastControlChange(null);
  }, [
    activeStreamUrl,
    isCastAvailable,
    isCastConnecting,
    isCasting,
    onCastControlChange,
    requestCastSession,
    stopCasting,
  ]);

  if (!channel) {
    return (
      <div className="relative aspect-video bg-card rounded-xl overflow-hidden flex items-center justify-center border border-border">
        <div className="text-center space-y-4">
          <Radio className="w-16 h-16 text-muted-foreground mx-auto" />
          <p className="text-xl text-muted-foreground">בחר ערוץ לצפייה</p>
        </div>
      </div>
    );
  }

  const playerNode = (
    <div
      ref={containerRef}
      data-player-root
      data-expanded={isExpanded && !isFullscreen ? "true" : "false"}
      data-mobile-device={isMobileDevice ? "true" : "false"}
      data-touch-device={isTouchDevice ? "true" : "false"}
      className={`
        relative overflow-hidden bg-black
        ${isExpanded && !isFullscreen ? "rounded-none" : "rounded-xl"}
        ${className || ""}
      `}
      onMouseMove={isMobileDevice ? undefined : showControls}
      onMouseLeave={isMobileDevice ? undefined : hideControls}
      onTouchStart={showControls}
    >
      <div
        className="relative w-full h-full bg-black"
        onClick={toggleControls}
        onDoubleClick={handlePlayerDoubleClick}
        dir="ltr"
      >
        <div
          data-vjs-player
          className={`absolute inset-0 ${isCasting ? "opacity-0 pointer-events-none" : ""}`}
        >
          <div ref={videoRef} className="video-js-container w-full h-full" />
        </div>

        {isCasting && !isCastConnecting ? (
          <div
            dir="rtl"
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 px-4 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Channel logo */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 p-2.5 sm:h-20 sm:w-20">
              <img
                src={getPlayerImageSrc(channel.playerLogo || channel.logo)}
                alt={channel.playerTitle || channel.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Cast icon + label */}
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <Cast className="h-3.5 w-3.5" />
              <span>מנוגן בטלויזיה{deviceName ? ` · ${deviceName}` : ""}</span>
            </div>

            {/* Channel name */}
            <p className="max-w-[200px] truncate text-center text-base font-semibold sm:text-lg">
              {channel.playerTitle || channel.name}
            </p>

            {/* Program */}
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              {channel.type !== "vod" && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
              )}
              <span className="truncate max-w-[180px]">
                {channel.playerSubtitle ? (
                  channel.playerSubtitle
                ) : (
                  <ProgramDisplay
                    program={currentProgram || channel.programs?.[0]}
                  />
                )}
              </span>
            </div>

            {/* Stop casting button */}
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                stopCasting();
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
            channel={channel}
            currentProgram={currentProgram}
            show={showOverlay}
            isExpanded={isExpanded && !isFullscreen}
            isFullscreen={isFullscreen}
            isCasting={isCasting}
            isCastAvailable={isCastAvailable}
            canCast={!!activeStreamUrl}
            isCastConnecting={isCastConnecting}
            isMobileDevice={isMobileDevice}
            onCast={isCasting ? stopCasting : requestCastSession}
            onClose={handleClose}
            onToggleExpanded={toggleExpanded}
            onToggleFullscreen={toggleFullscreen}
            onInteraction={keepControlsVisible}
            topControls={{
              showChannelInfo: !shouldHideTopControls,
              showCast: !shouldHideTopControls,
              showClose: !shouldHideTopControls,
            }}
            bottomControls={{
              showPlay: true,
              showSeek: true,
              showTime: true,
              showVolume: true,
              showLive: channel.type !== "vod",
              showQuality: true,
              showCast: false,
              showExpand: true,
              showFullscreen: true,
            }}
          />
        )}
      </div>

      {isLoading && !hasError && !isCasting && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse overflow-hidden">
              <img
                src={getPlayerImageSrc(loadingImage)}
                alt={loadingTitle}
              />
            </div>
            <div className="space-y-1">
              <p className="text-white">{loadingMessage}</p>
              {channel.type === "vod" && loadingTitle && (
                <p className="max-w-56 truncate text-sm text-white/70">
                  {loadingTitle}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasError && !isCasting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
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
          </div>
        </div>
      )}

      {autoNextCountdown !== null && autoNextLabel && !isCasting && (
        <div
          dir="rtl"
          className="absolute bottom-16 left-3 right-3 z-50 flex items-center gap-3 rounded-lg border border-white/20 bg-black/90 p-3 text-white shadow-xl sm:left-4 sm:right-auto sm:w-80"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
            {autoNextCountdown}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/65">הפרק הבא מתחיל בעוד</p>
            <p className="truncate text-sm font-semibold">{autoNextLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAutoNextCountdown(null);
              onCancelAutoNext?.();
            }}
            className="shrink-0 gap-1 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
            ביטול
          </Button>
        </div>
      )}

      <style jsx global>{`
        :fullscreen {
          width: 100dvw !important;
          height: 100dvh !important;
          border-radius: 0 !important;
          background: black;
        }

        :-webkit-full-screen {
          width: 100dvw !important;
          height: 100dvh !important;
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
          border-radius: 0 !important;
        }

        .video-js-container,
        .video-js,
        .video-js video {
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  );

  return (
    <div ref={inlineHostRef} className="contents">
      {playerNode}
    </div>
  );
}
