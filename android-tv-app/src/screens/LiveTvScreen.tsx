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
import PageLoadingOverlay from '../components/common/PageLoadingOverlay';
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
} from '../utils/epgUtils';

interface LiveTvScreenProps {
  onPlayFullscreen: (channel: TvChannel, program?: TvProgram | null) => void;
  focusNonce?: number;
  onRequestSideNavFocus?: (dest: AppDestination) => void;
  isSideNavActive?: boolean;
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
  activeChannelId,
  activeStreamUrl: externalStreamUrl,
  isVideoReady = false,
  isMuted: externalIsMuted = false,
  onToggleMute: externalOnToggleMute,
  onMediaChange,
}) => {
  const cachedGuide = api.getCachedGuideData();
  const [guideData, setGuideData] = useState<GuideData | null>(cachedGuide);
  const [isLoading, setIsLoading] = useState(!cachedGuide);
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

  // Window viewport width for horizontal scroll calculation
  const screenWidth = Dimensions.get('window').width;
  const viewportWidth = Math.max(300, screenWidth - CHANNEL_WIDTH - 48);

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
  const [selectedTimeAnchor, setSelectedTimeAnchor] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Immediate focus for grid navigation (60 FPS)
  // Debounced hero presentation state (150ms) to prevent image decoding/layout thrash during rapid navigation
  const [heroRowIndex, setHeroRowIndex] = useState(initialRowIdx);
  const [heroProgramIndex, setHeroProgramIndex] = useState(0);
  const heroDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (heroDebounceTimerRef.current) {
      clearTimeout(heroDebounceTimerRef.current);
    }
    heroDebounceTimerRef.current = setTimeout(() => {
      setHeroRowIndex(selectedRowIndex);
      setHeroProgramIndex(selectedProgramIndex);
    }, 150);

    return () => {
      if (heroDebounceTimerRef.current) {
        clearTimeout(heroDebounceTimerRef.current);
      }
    };
  }, [selectedRowIndex, selectedProgramIndex]);

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
    const startRow = Math.max(0, selectedRowIndex - 3);
    const endRow = Math.min(channels.length - 1, selectedRowIndex + 5);
    for (let i = startRow; i <= endRow; i++) {
      const ch = channels[i];
      if (ch) {
        map[ch.id] = getOrComputePrograms(ch);
      }
    }
    const curCh = channels[selectedRowIndex];
    if (curCh && !map[curCh.id]) {
      map[curCh.id] = getOrComputePrograms(curCh);
    }
    return map;
  }, [guideData, channels, selectedRowIndex, getOrComputePrograms]);

  // Load guide data from API
  const loadGuide = useCallback(async () => {
    try {
      const data = await api.getGuideData();
      setGuideData(data);
      if (data.channels.length > 0) {
        const targetIdx = activeChannelId
          ? data.channels.findIndex((c) => c.id === activeChannelId)
          : 0;
        const validIdx = targetIdx >= 0 ? targetIdx : 0;
        setSelectedRowIndex(validIdx);
        setHeroRowIndex(validIdx);
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
        setSelectedProgramIndex(effectiveProgIdx);
        setHeroProgramIndex(effectiveProgIdx);

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

        const targetY = Math.max(0, (validIdx - 1) * INACTIVE_ROW_HEIGHT);
        currentScrollYRef.current = targetY;
        scrollYAnim.setValue(targetY);
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת לוח שידורים');
    } finally {
      setIsLoading(false);
    }
  }, [activeChannelId, timelineStartSeconds, timelineEndSeconds, viewportWidth, scrollOffsetAnim, scrollYAnim]);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

  // Active channel and program objects for grid navigation
  const activeChannel = channels[selectedRowIndex] || null;
  const activeChannelPrograms = (activeChannel && (programsByChannelMap[activeChannel.id] || getOrComputePrograms(activeChannel))) || [];
  const activeProgram = activeChannelPrograms[selectedProgramIndex] || null;

  // Hero uses debounced indices to avoid layout/artwork churn during rapid D-pad steps
  const heroChannel = channels[heroRowIndex] || activeChannel;
  const heroChannelPrograms = (heroChannel && (programsByChannelMap[heroChannel.id] || getOrComputePrograms(heroChannel))) || [];
  const heroProgram = heroChannelPrograms[heroProgramIndex] || activeProgram;

  // Smooth scroll animations
  const animateHorizontalScroll = useCallback((targetOffset: number) => {
    currentScrollOffsetRef.current = targetOffset;
    setScrollOffsetPx(targetOffset);
    Animated.timing(scrollOffsetAnim, {
      toValue: targetOffset,
      duration: GRID_MOTION_MS,
      useNativeDriver: true,
    }).start();
  }, [scrollOffsetAnim]);

  const animateVerticalScroll = useCallback((targetY: number) => {
    currentScrollYRef.current = targetY;
    Animated.timing(scrollYAnim, {
      toValue: targetY,
      duration: GRID_MOTION_MS,
      useNativeDriver: true,
    }).start();
  }, [scrollYAnim]);

  // Requirement 5: Hero updates + Debounced background playback (350ms)
  useEffect(() => {
    if (!heroChannel) return;

    if (playbackDebounceTimerRef.current) {
      clearTimeout(playbackDebounceTimerRef.current);
      playbackDebounceTimerRef.current = null;
    }

    const isLive = heroProgram ? isProgramCurrent(heroProgram, nowSeconds) : false;

    if (isLive) {
      if (playingChannel?.id === heroChannel.id && externalStreamUrl) {
        return; // Already playing this channel
      }
      // 350ms debounce before switching live stream
      playbackDebounceTimerRef.current = setTimeout(async () => {
        setPlayingChannel(heroChannel);
        let stream = heroChannel.streamUrl;
        if (!stream && heroChannel.rawChannel) {
          const resolved = await api.getLiveChannelStream(heroChannel.rawChannel);
          if (resolved) stream = resolved;
        }
        onMediaChange?.(stream, heroChannel.id);
      }, 350);
    } else {
      // Non-live program: keep channel playing in background behind showArtwork
      if (playingChannel?.id !== heroChannel.id) {
        setPlayingChannel(heroChannel);
      }
    }

    return () => {
      if (playbackDebounceTimerRef.current) {
        clearTimeout(playbackDebounceTimerRef.current);
      }
    };
  }, [heroChannel?.id, heroProgram?.id, nowSeconds, playingChannel?.id, externalStreamUrl, onMediaChange]);

  const handleToggleMute = useCallback(() => {
    if (externalOnToggleMute) {
      externalOnToggleMute();
    } else {
      setLocalIsMuted((m) => !m);
    }
  }, [externalOnToggleMute]);

  // Remote key listeners for full D-pad grid navigation
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode, repeatCount = 0 }: { keyCode: number; repeatCount?: number }) => {
        console.log('[LiveTvKey]', keyCode, 'isSideNavActive:', isSideNavActiveRef.current, 'isHeroFocused:', isHeroFocused, 'row:', selectedRowIndex, 'prog:', selectedProgramIndex, 'column:', focusedColumn);
        if (isSideNavActiveRef.current) return;
        const now = Date.now();
        const timeSince = now - lastNavTimeRef.current;

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocused) return;

          if (selectedRowIndex === 0) {
            // From top channel row, move UP to Hero Actions
            setIsHeroFocused(true);
            setHeroFocusButton('fullscreen');
            setHeroFocusNonce(Date.now());
          } else {
            // Move up one channel row, maintaining time anchor
            const nextRow = selectedRowIndex - 1;
            setSelectedRowIndex(nextRow);

            const nextCh = channels[nextRow];
            const nextProgs = nextCh ? programsByChannelMap[nextCh.id] || getOrComputePrograms(nextCh) : [];
            const nextProgIdx = programIndexAtTime(nextProgs, selectedTimeAnchor);
            const validProgIdx = nextProgIdx >= 0 ? nextProgIdx : 0;
            setSelectedProgramIndex(validProgIdx);

            // Animate vertical scroll
            const targetY = Math.max(0, (nextRow - 1) * INACTIVE_ROW_HEIGHT);
            animateVerticalScroll(targetY);

            // Ensure next program is horizontally visible
            const nextProg = nextProgs[validProgIdx];
            if (nextProg) {
              const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidth);
              const targetX = scrollOffsetKeepingProgramVisible(
                nextProg,
                timelineStartSeconds,
                SLOT_WIDTH,
                viewportWidth,
                currentScrollOffsetRef.current,
                maxScroll
              );
              if (targetX !== currentScrollOffsetRef.current) {
                animateHorizontalScroll(targetX);
              }
            }
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocused) {
            // Return down from Hero to Grid
            setIsHeroFocused(false);
            setHeroFocusButton(null);
            setHeroFocusNonce(0);
          } else if (selectedRowIndex < channels.length - 1) {
            // Move down one channel row, maintaining time anchor
            const nextRow = selectedRowIndex + 1;
            setSelectedRowIndex(nextRow);

            const nextCh = channels[nextRow];
            const nextProgs = nextCh ? programsByChannelMap[nextCh.id] || getOrComputePrograms(nextCh) : [];
            const nextProgIdx = programIndexAtTime(nextProgs, selectedTimeAnchor);
            const validProgIdx = nextProgIdx >= 0 ? nextProgIdx : 0;
            setSelectedProgramIndex(validProgIdx);

            // Animate vertical scroll
            const targetY = Math.max(0, (nextRow - 1) * INACTIVE_ROW_HEIGHT);
            animateVerticalScroll(targetY);

            // Ensure next program is horizontally visible
            const nextProg = nextProgs[validProgIdx];
            if (nextProg) {
              const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidth);
              const targetX = scrollOffsetKeepingProgramVisible(
                nextProg,
                timelineStartSeconds,
                SLOT_WIDTH,
                viewportWidth,
                currentScrollOffsetRef.current,
                maxScroll
              );
              if (targetX !== currentScrollOffsetRef.current) {
                animateHorizontalScroll(targetX);
              }
            }
          }
        }
        // DPAD_RIGHT = 22
        else if (keyCode === 22) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocused) {
            if (heroFocusButton === 'fullscreen') {
              setHeroFocusButton('mute');
            }
          } else {
            if (focusedColumn === 'channel') {
              // Move from Channel card into Programs
              setFocusedColumn('program');
            } else if (selectedProgramIndex < activeChannelPrograms.length - 1) {
              // Move to next program in row
              const nextIdx = selectedProgramIndex + 1;
              setSelectedProgramIndex(nextIdx);
              const prog = activeChannelPrograms[nextIdx];
              if (prog) {
                setSelectedTimeAnchor(prog.startSeconds);
                const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidth);
                const targetX = scrollOffsetKeepingProgramVisible(
                  prog,
                  timelineStartSeconds,
                  SLOT_WIDTH,
                  viewportWidth,
                  currentScrollOffsetRef.current,
                  maxScroll
                );
                animateHorizontalScroll(targetX);
              }
            }
          }
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (timeSince < GRID_NAV_THROTTLE_MS) return;
          lastNavTimeRef.current = now;

          if (isHeroFocused) {
            if (heroFocusButton === 'mute') {
              setHeroFocusButton('fullscreen');
            } else if (heroFocusButton === 'fullscreen') {
              onRequestSideNavFocus?.(AppDestination.LIVE_TV);
            }
          } else {
            if (focusedColumn === 'program') {
              if (selectedProgramIndex > 0) {
                // Move to previous program in row
                const prevIdx = selectedProgramIndex - 1;
                setSelectedProgramIndex(prevIdx);
                const prog = activeChannelPrograms[prevIdx];
                if (prog) {
                  setSelectedTimeAnchor(prog.startSeconds);
                  const maxScroll = Math.max(0, (GRID_VISIBLE_WINDOW_SECONDS / HALF_HOUR_SECONDS) * SLOT_WIDTH - viewportWidth);
                  const targetX = scrollOffsetKeepingProgramVisible(
                    prog,
                    timelineStartSeconds,
                    SLOT_WIDTH,
                    viewportWidth,
                    currentScrollOffsetRef.current,
                    maxScroll
                  );
                  animateHorizontalScroll(targetX);
                }
              } else {
                // Leftmost program: move focus to channel card
                setFocusedColumn('channel');
              }
            } else if (focusedColumn === 'channel') {
              // On channel card: open Side Nav Rail
              onRequestSideNavFocus?.(AppDestination.LIVE_TV);
            }
          }
        }
        // DPAD_CENTER = 23 or ENTER = 66
        else if (keyCode === 23 || keyCode === 66) {
          if (Date.now() - mountTimeRef.current < 400) return;
          if (isHeroFocused) {
            if (heroFocusButton === 'fullscreen' && activeChannel) {
              onPlayFullscreen(activeChannel, activeProgram);
            } else if (heroFocusButton === 'mute') {
              handleToggleMute();
            }
          } else if (activeChannel) {
            onPlayFullscreen(activeChannel, activeProgram);
          }
        }
        // BACK = 4
        else if (keyCode === 4) {
          if (isHeroFocused) {
            setIsHeroFocused(false);
            setHeroFocusButton(null);
          } else {
            onRequestSideNavFocus?.(AppDestination.LIVE_TV);
          }
        }
      }
    );

    return () => sub.remove();
  }, [
    isHeroFocused,
    heroFocusButton,
    selectedRowIndex,
    focusedColumn,
    selectedProgramIndex,
    selectedTimeAnchor,
    channels,
    activeChannel,
    activeProgram,
    activeChannelPrograms,
    programsByChannelMap,
    viewportWidth,
    timelineStartSeconds,
    animateHorizontalScroll,
    animateVerticalScroll,
    onPlayFullscreen,
    onRequestSideNavFocus,
    handleToggleMute,
  ]);

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

  // Hero Presentation (debounced to avoid artwork and layout thrashing during fast D-pad steps)
  const isLiveProgram = heroProgram ? isProgramCurrent(heroProgram, nowSeconds) : false;
  const heroTitle = heroProgram?.title || heroChannel?.name || 'שידור חי';
  const heroSubtitle = heroChannel?.name || '';
  const heroDescription =
    heroProgram?.description ||
    (isLiveProgram ? `שידור חי בערוץ ${heroChannel?.name || ''}` : heroChannel?.name || '');
  const heroTimeRange = heroProgram?.timeRange;
  const heroChannelLogoUrl = heroChannel?.logoUrl;
  const backgroundImageUrl = heroProgram?.imageUrl || heroChannel?.logoUrl;
  const currentStream = externalStreamUrl || playingChannel?.streamUrl;

  if (isLoading || !guideData || guideData.channels.length === 0) {
    return <PageLoadingOverlay message="טוען לוח שידורים..." />;
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
          hasTVPreferredFocus={!isSideNavActive}
          focusNonce={focusNonce}
          style={styles.focusAnchor}
          focusedStyle={styles.focusAnchorFocused}
          focusable={!isSideNavActive}
        />
        <EpgGrid
          data={guideData}
          programsMap={programsByChannelMap}
          isLoading={isLoading}
          error={error}
          selectedRowIndex={selectedRowIndex}
          selectedProgramIndex={selectedProgramIndex}
          focusedColumn={focusedColumn}
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
    width: 0,
    height: 0,
    opacity: 0,
    backgroundColor: 'transparent',
    top: 0,
    left: 0,
    zIndex: -1,
  },
  focusAnchorFocused: {
    borderWidth: 0,
    borderColor: 'transparent',
    width: 0,
    height: 0,
    opacity: 0,
  },
  fullScreenLoading: {
    flex: 1,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LiveTvScreen;
