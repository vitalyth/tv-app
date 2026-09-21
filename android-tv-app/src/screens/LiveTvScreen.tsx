import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  DeviceEventEmitter,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { TvChannel, TvProgram, GuideData, AppDestination } from '../types/guide';
import { api } from '../services/api';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import HeroActions from '../components/hero/HeroActions';
import EpgGrid from '../components/livetv/EpgGrid';
import { TvFocusable } from '../components/common/TvFocusable';
import { useTvNav } from '../context/TvNavContext';
import {
  GRID_LOOKBACK_SECONDS,
  GRID_VISIBLE_WINDOW_SECONDS,
  HALF_HOUR_SECONDS,
  SLOT_WIDTH,
  CHANNEL_WIDTH,
  INACTIVE_ROW_HEIGHT,
  GRID_MOTION_MS,
  GRID_NAV_THROTTLE_MS,
  floorToHalfHour,
  formatTimeRange,
  isProgramCurrent,
  displayProgramsForChannel,
  programIndexAtTime,
  liveProgramIndex,
  scrollOffsetKeepingProgramVisible,
  preferredFirstVisibleRow,
} from '../utils/epgUtils';

interface LiveTvScreenProps {
  onPlayFullscreen: (channel: TvChannel, program?: TvProgram | null) => void;
  focusNonce?: number;
  onRequestSideNavFocus?: (dest: AppDestination) => void;
  isSideNavActive?: boolean;
  isPlayerActive?: boolean;
  activeChannelId?: string | null;
  activeStreamUrl?: string | null;
  isVideoReady?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onMediaChange?: (streamUrl: string | null, channelId?: string | null) => void;
}

export const LiveTvScreen: React.FC<LiveTvScreenProps> = ({
  onPlayFullscreen,
  focusNonce = 0,
  onRequestSideNavFocus,
  isSideNavActive = false,
  isPlayerActive = false,
  activeChannelId,
  activeStreamUrl: externalStreamUrl,
  isVideoReady = false,
  isMuted: externalIsMuted = false,
  onToggleMute: externalOnToggleMute,
  onMediaChange,
}) => {
  const cachedGuide = api.getCachedGuideData();
  const [guideData, setGuideData] = useState<GuideData | null>(cachedGuide);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Time state: current time in epoch seconds, updated every minute
  const [nowSeconds, setNowSeconds] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const scheduleNextMinute = () => {
      const nowMs = Date.now();
      const delayMs = 60000 - (nowMs % 60000);
      timerId = setTimeout(() => {
        setNowSeconds(Math.floor(Date.now() / 1000));
        scheduleNextMinute();
      }, delayMs);
    };
    scheduleNextMinute();
    return () => clearTimeout(timerId);
  }, []);

  // 12-Hour Timeline Window calculated from current time
  const timelineStartSeconds = useMemo(() => {
    return floorToHalfHour(nowSeconds) - GRID_LOOKBACK_SECONDS;
  }, [nowSeconds]);

  const timelineEndSeconds = useMemo(() => {
    return timelineStartSeconds + GRID_VISIBLE_WINDOW_SECONDS;
  }, [timelineStartSeconds]);

  // Window viewport width for horizontal scroll calculation - stretches to the right screen edge
  const { railWidth, isFullscreenPlayerActive } = useTvNav();
  const screenWidth = Dimensions.get('window').width;
  const viewportWidth = Math.max(300, screenWidth - (railWidth + 24) - CHANNEL_WIDTH);

  // Channels and program maps
  const channels = guideData?.channels || [];

  // Channel & Program selection state
  const initialRowIdx = useMemo(() => {
    if (!channels.length) return 0;
    if (activeChannelId) {
      const idx = channels.findIndex((c) => c.id === activeChannelId);
      if (idx !== -1) return idx;
    }
    return 0;
  }, [channels, activeChannelId]);

  const [selectedRowIndex, setSelectedRowIndex] = useState(initialRowIdx);
  const [focusedColumn, setFocusedColumn] = useState<'channel' | 'program'>('program');
  const [selectedProgramIndex, setSelectedProgramIndex] = useState(0);
  const selectedTimeAnchorRef = useRef<number>(Math.floor(Date.now() / 1000));

  const hasInitializedSelectionRef = useRef(false);
  const initialChannelIdRef = useRef(activeChannelId);

  // Audio / Video playback state
  const [playingChannel, setPlayingChannel] = useState<TvChannel | null>(() => {
    return channels[initialRowIdx] || null;
  });
  const [localIsMuted, setLocalIsMuted] = useState(false);
  const isMuted = externalOnToggleMute ? externalIsMuted : localIsMuted;
  const [scrollOffsetPx, setScrollOffsetPx] = useState(0);

  // Hero Actions focus
  const [isHeroFocused, setIsHeroFocused] = useState(false);
  const [heroFocusButton, setHeroFocusButton] = useState<'fullscreen' | 'mute' | null>(null);
  const [heroFocusNonce, setHeroFocusNonce] = useState(0);
  const [gridFocusNonce, setGridFocusNonce] = useState(0);

  // Clear Hero focus when SideNav becomes active
  useEffect(() => {
    if (isSideNavActive) {
      setIsHeroFocused(false);
      setHeroFocusButton(null);
      setHeroFocusNonce(0);
    }
  }, [isSideNavActive]);

  // Animated scroll offsets
  const scrollOffsetAnim = useRef(new Animated.Value(0)).current;
  const currentScrollOffsetRef = useRef(0);
  const scrollYAnim = useRef(new Animated.Value(0)).current;
  const currentScrollYRef = useRef(0);

  // Debounced background playback timer ref (350ms matching old app)
  const playbackDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavTimeRef = useRef(0);
  const mountTimeRef = useRef(Date.now());
  const isSideNavActiveRef = useRef(isSideNavActive);
  isSideNavActiveRef.current = isSideNavActive;

  const isPlayerEffective = isPlayerActive || isFullscreenPlayerActive;
  const isPlayerActiveRef = useRef(isPlayerEffective);
  isPlayerActiveRef.current = isPlayerEffective;

  const prevFocusNonceRef = useRef(focusNonce);

  // Cached program map: compute displayProgramsForChannel lazily for needed channels
  const programsCacheRef = useRef<Record<string, TvProgram[]>>({});
  const lastTimelineStartRef = useRef<number>(timelineStartSeconds);

  if (lastTimelineStartRef.current !== timelineStartSeconds) {
    programsCacheRef.current = {};
    lastTimelineStartRef.current = timelineStartSeconds;
  }

  const getOrComputePrograms = useCallback((channel: TvChannel): TvProgram[] => {
    if (programsCacheRef.current[channel.id]) {
      return programsCacheRef.current[channel.id];
    }
    const raw = guideData?.programsByChannel[channel.id] || [];
    const computed = displayProgramsForChannel(
      channel,
      raw,
      timelineStartSeconds,
      timelineEndSeconds
    );
    programsCacheRef.current[channel.id] = computed;
    return computed;
  }, [guideData, timelineStartSeconds, timelineEndSeconds]);

  const programsByChannelMap = useMemo(() => {
    const map: Record<string, TvProgram[]> = {};
    if (!guideData || channels.length === 0) return map;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (ch) {
        map[ch.id] = getOrComputePrograms(ch);
      }
    }
    return map;
  }, [guideData, channels, getOrComputePrograms]);

  // Load guide data from API
  const loadGuide = useCallback(async () => {
    try {
      if (!hasInitializedSelectionRef.current) {
        setIsLoading(true);
      }
      const data = await api.getGuideData();
      setGuideData(data);
      if (data.channels.length > 0 && !hasInitializedSelectionRef.current) {
        hasInitializedSelectionRef.current = true;
        const targetIdx = initialChannelIdRef.current
          ? data.channels.findIndex((c) => c.id === initialChannelIdRef.current)
          : 0;
        const validIdx = targetIdx >= 0 ? targetIdx : 0;
        selectedRowIndexRef.current = validIdx;
        setSelectedRowIndex(validIdx);
        const targetCh = data.channels[validIdx];
        setPlayingChannel(targetCh);

        const chProgs = displayProgramsForChannel(
          targetCh,
          data.programsByChannel[targetCh.id] || [],
          timelineStartSeconds,
          timelineEndSeconds
        );
        const liveIdx = liveProgramIndex(chProgs, Math.floor(Date.now() / 1000));
        const effectiveProgIdx = liveIdx >= 0 ? liveIdx : 0;
        selectedProgramIndexRef.current = effectiveProgIdx;
        setSelectedProgramIndex(effectiveProgIdx);

        const liveProg = chProgs[effectiveProgIdx];
        if (liveProg) {
          const maxScroll = Math.max(
            0,
            (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidth
          );
          const targetX = scrollOffsetKeepingProgramVisible(
            liveProg,
            timelineStartSeconds,
            SLOT_WIDTH,
            viewportWidth,
            0,
            maxScroll
          );
          currentScrollOffsetRef.current = targetX;
          setScrollOffsetPx(targetX);
          scrollOffsetAnim.setValue(targetX);
        }

        const firstVisibleRow = preferredFirstVisibleRow(validIdx, data.channels.length);
        const targetY = firstVisibleRow * INACTIVE_ROW_HEIGHT;
        currentScrollYRef.current = targetY;
        scrollYAnim.setValue(targetY);
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת לוח שידורים');
    } finally {
      setIsLoading(false);
    }
  }, [timelineStartSeconds, timelineEndSeconds, viewportWidth, scrollOffsetAnim, scrollYAnim]);

  useEffect(() => {
    loadGuide();

    // 10-minute silent refresh interval matching old app LIVE_GUIDE_REFRESH_INTERVAL_MS
    const refreshTimer = setInterval(async () => {
      try {
        const freshData = await api.getGuideData(true);
        if (freshData && freshData.channels.length > 0) {
          setGuideData(freshData);
        }
      } catch {
        // Silent error handling: preserve current guide
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshTimer);
  }, [loadGuide]);

  // Active channel and program objects for grid navigation & hero presentation
  const activeChannel = channels[selectedRowIndex] || null;
  const activeChannelPrograms = (activeChannel && (programsByChannelMap[activeChannel.id] || getOrComputePrograms(activeChannel))) || [];
  const activeProgram = activeChannelPrograms[selectedProgramIndex] || null;

  const scrollOffsetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth scroll animations
  const animateHorizontalScroll = useCallback((targetOffset: number) => {
    currentScrollOffsetRef.current = targetOffset;
    Animated.timing(scrollOffsetAnim, {
      toValue: targetOffset,
      duration: GRID_MOTION_MS,
      useNativeDriver: true,
    }).start();

    // Quantized update: only re-render JS rows if scroll changed by >= 180px (1 slot)
    setScrollOffsetPx((prev) => {
      if (Math.abs(prev - targetOffset) >= 180) {
        return Math.round(targetOffset / 180) * 180;
      }
      return prev;
    });

    // Debounced sync when scrolling settles
    if (scrollOffsetDebounceRef.current) {
      clearTimeout(scrollOffsetDebounceRef.current);
    }
    scrollOffsetDebounceRef.current = setTimeout(() => {
      setScrollOffsetPx(targetOffset);
    }, 120);
  }, [scrollOffsetAnim]);

  const animateVerticalScroll = useCallback((targetY: number) => {
    currentScrollYRef.current = targetY;
    Animated.timing(scrollYAnim, {
      toValue: targetY,
      duration: GRID_MOTION_MS,
      useNativeDriver: true,
    }).start();
  }, [scrollYAnim]);

  // Requirement 5: Debounced background playback (350ms)
  useEffect(() => {
    if (!activeChannel) return;

    if (playbackDebounceTimerRef.current) {
      clearTimeout(playbackDebounceTimerRef.current);
      playbackDebounceTimerRef.current = null;
    }

    const isLive = activeProgram ? isProgramCurrent(activeProgram, nowSeconds) : false;

    if (!isLive) {
      // Non-live program: immediately stop player and audio
      if (playingChannel !== null) {
        setPlayingChannel(null);
        onMediaChange?.(null, null);
      }
      return;
    }

    // Is live program: if channel changed, immediately cut off previous audio/video
    if (playingChannel?.id !== activeChannel.id) {
      onMediaChange?.(null, null);
      setPlayingChannel(null);
    } else if (externalStreamUrl) {
      return; // Already playing this channel
    }

    // 350ms debounce before switching live stream: directly transition to new stream without unmounting player
    playbackDebounceTimerRef.current = setTimeout(async () => {
      setPlayingChannel(activeChannel);
      let stream = activeChannel.streamUrl;
      if (!stream && activeChannel.rawChannel) {
        const resolved = await api.getLiveChannelStream(activeChannel.rawChannel);
        if (resolved) stream = resolved;
      }
      onMediaChange?.(stream, activeChannel.id);
    }, 350);

    return () => {
      if (playbackDebounceTimerRef.current) {
        clearTimeout(playbackDebounceTimerRef.current);
      }
    };
  }, [activeChannel?.id, activeProgram?.id, nowSeconds, playingChannel?.id, externalStreamUrl, onMediaChange]);

  const handleToggleMute = useCallback(() => {
    if (externalOnToggleMute) {
      externalOnToggleMute();
    } else {
      setLocalIsMuted((m) => !m);
    }
  }, [externalOnToggleMute]);

  // Refs for synchronous event handling without listener re-binding
  const selectedRowIndexRef = useRef(selectedRowIndex);
  selectedRowIndexRef.current = selectedRowIndex;

  const selectedProgramIndexRef = useRef(selectedProgramIndex);
  selectedProgramIndexRef.current = selectedProgramIndex;

  const focusedColumnRef = useRef(focusedColumn);
  focusedColumnRef.current = focusedColumn;

  const isHeroFocusedRef = useRef(isHeroFocused);
  isHeroFocusedRef.current = isHeroFocused;

  const heroFocusButtonRef = useRef(heroFocusButton);
  heroFocusButtonRef.current = heroFocusButton;

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const programsByChannelMapRef = useRef(programsByChannelMap);
  programsByChannelMapRef.current = programsByChannelMap;

  const activeChannelProgramsRef = useRef(activeChannelPrograms);
  activeChannelProgramsRef.current = activeChannelPrograms;

  const activeChannelRef = useRef(activeChannel);
  activeChannelRef.current = activeChannel;

  const activeProgramRef = useRef(activeProgram);
  activeProgramRef.current = activeProgram;

  const viewportWidthRef = useRef(viewportWidth);
  viewportWidthRef.current = viewportWidth;

  const timelineStartSecondsRef = useRef(timelineStartSeconds);
  timelineStartSecondsRef.current = timelineStartSeconds;

  const getOrComputeProgramsRef = useRef(getOrComputePrograms);
  getOrComputeProgramsRef.current = getOrComputePrograms;

  const onPlayFullscreenRef = useRef(onPlayFullscreen);
  onPlayFullscreenRef.current = onPlayFullscreen;

  const onRequestSideNavFocusRef = useRef(onRequestSideNavFocus);
  onRequestSideNavFocusRef.current = onRequestSideNavFocus;

  const handleToggleMuteRef = useRef(handleToggleMute);
  handleToggleMuteRef.current = handleToggleMute;

  const animateHorizontalScrollRef = useRef(animateHorizontalScroll);
  animateHorizontalScrollRef.current = animateHorizontalScroll;

  const animateVerticalScrollRef = useRef(animateVerticalScroll);
  animateVerticalScrollRef.current = animateVerticalScroll;

  // Requirement: When closing fullscreen player, restore focus to the active channel's LIVE program
  useEffect(() => {
    if (focusNonce > 0 && focusNonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusNonce;

      const chList = channelsRef.current;
      if (chList.length === 0) return;

      const targetChannelId = activeChannelId || playingChannel?.id;
      let targetRow = -1;
      if (targetChannelId) {
        targetRow = chList.findIndex((c) => c.id === targetChannelId);
      }
      const validRowIdx = targetRow >= 0 ? targetRow : selectedRowIndexRef.current;
      selectedRowIndexRef.current = validRowIdx;
      setSelectedRowIndex(validRowIdx);

      const targetCh = chList[validRowIdx];
      if (targetCh) {
        setPlayingChannel(targetCh);
        const progMap = programsByChannelMapRef.current;
        const chProgs = progMap[targetCh.id] || getOrComputeProgramsRef.current(targetCh);

        const nowSec = Math.floor(Date.now() / 1000);
        const liveIdx = liveProgramIndex(chProgs, nowSec);
        const validProgIdx = liveIdx >= 0 ? liveIdx : 0;

        selectedProgramIndexRef.current = validProgIdx;
        setSelectedProgramIndex(validProgIdx);

        focusedColumnRef.current = 'program';
        setFocusedColumn('program');
        isHeroFocusedRef.current = false;
        setIsHeroFocused(false);
        heroFocusButtonRef.current = null;
        setHeroFocusButton(null);
        setHeroFocusNonce(0);

        const liveProg = chProgs[validProgIdx];
        if (liveProg) {
          selectedTimeAnchorRef.current = liveProg.startSeconds;
          const maxScroll = Math.max(
            0,
            (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidthRef.current
          );
          const targetX = scrollOffsetKeepingProgramVisible(
            liveProg,
            timelineStartSecondsRef.current,
            SLOT_WIDTH,
            viewportWidthRef.current,
            currentScrollOffsetRef.current,
            maxScroll
          );
          animateHorizontalScrollRef.current(targetX);
        }

        const firstVisibleRow = preferredFirstVisibleRow(validRowIdx, chList.length);
        const targetY = firstVisibleRow * INACTIVE_ROW_HEIGHT;
        animateVerticalScrollRef.current(targetY);

        setGridFocusNonce(Date.now());
      }
    }
  }, [focusNonce, activeChannelId, playingChannel?.id]);

  // Remote key listeners for full D-pad grid navigation (stable mount with 70ms throttle)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode }: { keyCode: number; repeatCount?: number }) => {
        if (isPlayerActiveRef.current || isSideNavActiveRef.current) return;
        const now = Date.now();
        const timeSince = now - lastNavTimeRef.current;

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) return;

          if (selectedRowIndexRef.current === 0) {
            // From top channel row, move UP to Hero Actions
            isHeroFocusedRef.current = true;
            setIsHeroFocused(true);
            heroFocusButtonRef.current = 'fullscreen';
            setHeroFocusButton('fullscreen');
            setHeroFocusNonce(Date.now());
          } else {
            // Move up one channel row, maintaining time anchor
            const nextRow = selectedRowIndexRef.current - 1;
            selectedRowIndexRef.current = nextRow;
            setSelectedRowIndex(nextRow);

            const chList = channelsRef.current;
            const nextCh = chList[nextRow];
            const progMap = programsByChannelMapRef.current;
            const nextProgs = nextCh ? progMap[nextCh.id] || getOrComputeProgramsRef.current(nextCh) : [];
            const nextProgIdx = programIndexAtTime(nextProgs, selectedTimeAnchorRef.current);
            const validProgIdx = nextProgIdx >= 0 ? nextProgIdx : 0;
            selectedProgramIndexRef.current = validProgIdx;
            setSelectedProgramIndex(validProgIdx);

            // Animate vertical scroll
            const firstVisibleRow = preferredFirstVisibleRow(nextRow, chList.length);
            const targetY = firstVisibleRow * INACTIVE_ROW_HEIGHT;
            animateVerticalScrollRef.current(targetY);

            // Ensure next program is horizontally visible
            const nextProg = nextProgs[validProgIdx];
            if (nextProg) {
              const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidthRef.current);
              const targetX = scrollOffsetKeepingProgramVisible(
                nextProg,
                timelineStartSecondsRef.current,
                SLOT_WIDTH,
                viewportWidthRef.current,
                currentScrollOffsetRef.current,
                maxScroll
              );
              if (targetX !== currentScrollOffsetRef.current) {
                animateHorizontalScrollRef.current(targetX);
              }
            }
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) {
            // Return down from Hero to Grid
            isHeroFocusedRef.current = false;
            setIsHeroFocused(false);
            heroFocusButtonRef.current = null;
            setHeroFocusButton(null);
            setHeroFocusNonce(0);
            setGridFocusNonce(Date.now());
          } else if (selectedRowIndexRef.current < channelsRef.current.length - 1) {
            // Move down one channel row, maintaining time anchor
            const nextRow = selectedRowIndexRef.current + 1;
            selectedRowIndexRef.current = nextRow;
            setSelectedRowIndex(nextRow);

            const chList = channelsRef.current;
            const nextCh = chList[nextRow];
            const progMap = programsByChannelMapRef.current;
            const nextProgs = nextCh ? progMap[nextCh.id] || getOrComputeProgramsRef.current(nextCh) : [];
            const nextProgIdx = programIndexAtTime(nextProgs, selectedTimeAnchorRef.current);
            const validProgIdx = nextProgIdx >= 0 ? nextProgIdx : 0;
            selectedProgramIndexRef.current = validProgIdx;
            setSelectedProgramIndex(validProgIdx);

            // Animate vertical scroll
            const firstVisibleRow = preferredFirstVisibleRow(nextRow, chList.length);
            const targetY = firstVisibleRow * INACTIVE_ROW_HEIGHT;
            animateVerticalScrollRef.current(targetY);

            // Ensure next program is horizontally visible
            const nextProg = nextProgs[validProgIdx];
            if (nextProg) {
              const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidthRef.current);
              const targetX = scrollOffsetKeepingProgramVisible(
                nextProg,
                timelineStartSecondsRef.current,
                SLOT_WIDTH,
                viewportWidthRef.current,
                currentScrollOffsetRef.current,
                maxScroll
              );
              if (targetX !== currentScrollOffsetRef.current) {
                animateHorizontalScrollRef.current(targetX);
              }
            }
          }
        }
        // DPAD_RIGHT = 22
        else if (keyCode === 22) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) {
            if (heroFocusButtonRef.current === 'fullscreen') {
              heroFocusButtonRef.current = 'mute';
              setHeroFocusButton('mute');
              setHeroFocusNonce(Date.now());
            }
          } else {
            if (focusedColumnRef.current === 'channel') {
              // Move from Channel card into Programs
              focusedColumnRef.current = 'program';
              setFocusedColumn('program');
            } else {
              const curProgIdx = selectedProgramIndexRef.current;
              const ch = channelsRef.current[selectedRowIndexRef.current];
              const progMap = programsByChannelMapRef.current;
              const progs = ch ? progMap[ch.id] || getOrComputeProgramsRef.current(ch) : [];
              if (curProgIdx < progs.length - 1) {
                const nextIdx = curProgIdx + 1;
                selectedProgramIndexRef.current = nextIdx;
                setSelectedProgramIndex(nextIdx);
                const prog = progs[nextIdx];
                if (prog) {
                  selectedTimeAnchorRef.current = prog.startSeconds;
                  const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidthRef.current);
                  const targetX = scrollOffsetKeepingProgramVisible(
                    prog,
                    timelineStartSecondsRef.current,
                    SLOT_WIDTH,
                    viewportWidthRef.current,
                    currentScrollOffsetRef.current,
                    maxScroll
                  );
                  animateHorizontalScrollRef.current(targetX);
                }
              }
            }
          }
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) {
            if (heroFocusButtonRef.current === 'mute') {
              heroFocusButtonRef.current = 'fullscreen';
              setHeroFocusButton('fullscreen');
              setHeroFocusNonce(Date.now());
            } else if (heroFocusButtonRef.current === 'fullscreen') {
              isHeroFocusedRef.current = false;
              setIsHeroFocused(false);
              heroFocusButtonRef.current = null;
              setHeroFocusButton(null);
              setHeroFocusNonce(0);
              onRequestSideNavFocusRef.current?.(AppDestination.LIVE_TV);
            }
          } else {
            if (focusedColumnRef.current === 'program') {
              const curProgIdx = selectedProgramIndexRef.current;
              if (curProgIdx > 0) {
                // Move to previous program in row
                const prevIdx = curProgIdx - 1;
                selectedProgramIndexRef.current = prevIdx;
                setSelectedProgramIndex(prevIdx);
                const ch = channelsRef.current[selectedRowIndexRef.current];
                const progMap = programsByChannelMapRef.current;
                const progs = ch ? progMap[ch.id] || getOrComputeProgramsRef.current(ch) : [];
                const prog = progs[prevIdx];
                if (prog) {
                  selectedTimeAnchorRef.current = prog.startSeconds;
                  const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidthRef.current);
                  const targetX = scrollOffsetKeepingProgramVisible(
                    prog,
                    timelineStartSecondsRef.current,
                    SLOT_WIDTH,
                    viewportWidthRef.current,
                    currentScrollOffsetRef.current,
                    maxScroll
                  );
                  animateHorizontalScrollRef.current(targetX);
                }
              } else {
                // Leftmost program: move focus to channel card
                focusedColumnRef.current = 'channel';
                setFocusedColumn('channel');
              }
            } else if (focusedColumnRef.current === 'channel') {
              // On channel card: open Side Nav Rail
              onRequestSideNavFocusRef.current?.(AppDestination.LIVE_TV);
            }
          }
        }
        // DPAD_CENTER = 23 or ENTER = 66
        else if (keyCode === 23 || keyCode === 66) {
          if (Date.now() - mountTimeRef.current < 400) return;
          if (isHeroFocusedRef.current) {
            if (heroFocusButtonRef.current === 'fullscreen' && activeChannelRef.current) {
              onPlayFullscreenRef.current(activeChannelRef.current, activeProgramRef.current);
            } else if (heroFocusButtonRef.current === 'mute') {
              handleToggleMuteRef.current();
            }
          } else if (activeChannelRef.current) {
            onPlayFullscreenRef.current(activeChannelRef.current, activeProgramRef.current);
          }
        }
        // BACK = 4
        else if (keyCode === 4) {
          if (isHeroFocusedRef.current) {
            isHeroFocusedRef.current = false;
            setIsHeroFocused(false);
            heroFocusButtonRef.current = null;
            setHeroFocusButton(null);
            setGridFocusNonce(Date.now());
          } else {
            onRequestSideNavFocusRef.current?.(AppDestination.LIVE_TV);
          }
        }
      }
    );

    return () => sub.remove();
  }, []);

  // Click handlers
  const handleChannelPress = useCallback((channel: TvChannel) => {
    onPlayFullscreen(channel, activeProgram);
  }, [onPlayFullscreen, activeProgram]);

  const handleProgramPress = useCallback((channel: TvChannel, program: TvProgram) => {
    onPlayFullscreen(channel, program);
  }, [onPlayFullscreen]);

  const handleOpenFullscreen = () => {
    if (activeChannel) {
      onPlayFullscreen(activeChannel, activeProgram);
    }
  };

  // Hero Presentation (instant updates on D-pad navigation)
  const isLiveProgram = activeProgram ? isProgramCurrent(activeProgram, nowSeconds) : false;
  const heroTitle = activeProgram?.title || activeChannel?.name || 'שידור חי';
  const heroSubtitle = activeChannel?.name || '';
  const heroDescription =
    activeProgram?.description ||
    (isLiveProgram ? `שידור חי בערוץ ${activeChannel?.name || ''}` : activeChannel?.name || '');
  const heroTimeRange = activeProgram?.timeRange;
  const heroChannelLogoUrl = activeChannel?.logoUrl;
  const backgroundImageUrl = activeProgram?.imageUrl || activeChannel?.logoUrl;
  const currentStream = externalStreamUrl || playingChannel?.streamUrl;

  if (isLoading || !guideData || guideData.channels.length === 0) {
    return (
      <View style={styles.fullScreenLoading}>
        <ActivityIndicator size="large" color="#25D4DE" />
      </View>
    );
  }

  return (
    <TvScreenLayout
      backgroundImageUrl={backgroundImageUrl}
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroDescription={heroDescription}
      heroTimeRange={heroTimeRange}
      heroChannelLogoUrl={heroChannelLogoUrl}
      isLive={isLiveProgram}
      videoStreamUrl={currentStream}
      isVideoPaused={!currentStream}
      isMuted={isMuted}
      onToggleMute={handleToggleMute}
      hasExternalPlayer={true}
      showArtwork={!isLiveProgram || !isVideoReady}
      actions={
        <HeroActions
          hasActivePlayer={isLiveProgram && Boolean(currentStream)}
          onOpenFullScreen={handleOpenFullscreen}
          onToggleMute={handleToggleMute}
          isMuted={isMuted}
          focusTargetButton={isHeroFocused ? heroFocusButton : null}
          focusNonce={heroFocusNonce}
          onFocusAction={(btn) => {
            if (isHeroFocused) {
              setHeroFocusButton(btn);
            }
          }}
        />
      }
    >
      <View style={styles.content}>
        <TvFocusable
          hasTVPreferredFocus={!isSideNavActive && !isHeroFocused}
          focusNonce={gridFocusNonce || focusNonce}
          style={styles.focusAnchor}
          focusedStyle={styles.focusAnchorFocused}
          focusable={!isSideNavActive && !isHeroFocused}
          scaleOnFocus={false}
          lockUp={false}
          lockDown={false}
          lockLeft={false}
          lockRight={false}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill} />
        </TvFocusable>
        <EpgGrid
          data={guideData}
          programsMap={programsByChannelMap}
          isLoading={isLoading}
          error={error}
          selectedRowIndex={selectedRowIndex}
          selectedProgramIndex={selectedProgramIndex}
          focusedColumn={focusedColumn}
          isGridFocused={!isSideNavActive && !isHeroFocused}
          playingChannel={playingChannel}
          scrollOffsetAnim={scrollOffsetAnim}
          scrollYAnim={scrollYAnim}
          scrollOffsetPx={scrollOffsetPx}
          viewportWidth={viewportWidth}
          timelineStartSeconds={timelineStartSeconds}
          timelineEndSeconds={timelineEndSeconds}
          nowSeconds={nowSeconds}
          onChannelPress={handleChannelPress}
          onProgramPress={handleProgramPress}
        />
      </View>
    </TvScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  focusAnchor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  focusAnchorFocused: {
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  fullScreenLoading: {
    flex: 1,
    marginLeft: 56,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LiveTvScreen;
