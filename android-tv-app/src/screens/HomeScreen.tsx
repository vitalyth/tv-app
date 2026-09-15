import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text, DeviceEventEmitter } from 'react-native';
import { AppDestination, TvChannel, TvProgram } from '../types/guide';
import { VodRecentItem } from '../types/vod';
import { api, resolveImageUrl } from '../services/api';
import { vodProgressService, ContinueWatchingItem } from '../services/vodProgress';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import HeroActions from '../components/hero/HeroActions';
import HomeRow from '../components/home/HomeRow';
import HomeLiveCard from '../components/home/HomeLiveCard';
import HomeContinueCard from '../components/home/HomeContinueCard';
import ShortcutCard from '../components/home/ShortcutCard';

interface HomeScreenProps {
  onPlayChannel: (channel: TvChannel, program?: TvProgram | null) => void;
  onPlayRecentVod?: (item: VodRecentItem) => void;
  onNavigateDestination?: (destination: AppDestination) => void;
  onRequestSideNavFocus?: (destination: AppDestination) => void;
  recentChannelIds?: string[];
  activeStreamUrl?: string | null;
  isVideoReady?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onMediaChange?: (streamUrl: string | null, channelId?: string | null) => void;
  focusNonce?: number;
  activeChannelId?: string | null;
  isPlayerActive?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = React.memo(({
  onPlayChannel,
  onPlayRecentVod,
  onNavigateDestination,
  onRequestSideNavFocus,
  recentChannelIds = [],
  activeStreamUrl,
  isVideoReady = false,
  isMuted = true,
  onToggleMute,
  onMediaChange,
  focusNonce = 0,
  activeChannelId,
  isPlayerActive = false,
}) => {
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([]);
  const [newVodItems, setNewVodItems] = useState<VodRecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focusedChannel, setFocusedChannel] = useState<TvChannel | null>(null);
  const [focusedRecent, setFocusedRecent] = useState<VodRecentItem | null>(null);
  const [showArtwork, setShowArtwork] = useState(!isVideoReady || !activeStreamUrl);
  const [hasHadInitialFocus, setHasHadInitialFocus] = useState(false);

  const [focusedLiveIndex, setFocusedLiveIndex] = useState(0);
  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(null);
  const [focusedContinueIndex, setFocusedContinueIndex] = useState(0);
  const [focusedContinueId, setFocusedContinueId] = useState<string | null>(null);
  const [focusedNewVodIndex, setFocusedNewVodIndex] = useState(0);
  const [focusedNewVodId, setFocusedNewVodId] = useState<string | null>(null);
  const [focusedShortcutIndex, setFocusedShortcutIndex] = useState(0);

  // Hero Actions focus state (Fullscreen vs Mute button)
  const [heroFocusButton, setHeroFocusButton] = useState<'fullscreen' | 'mute' | null>(null);
  const [heroFocusNonce, setHeroFocusNonce] = useState(0);
  const isHeroFocusedRef = useRef(false);

  // Card programmatic focus target for D-pad navigation
  const [cardFocusTarget, setCardFocusTarget] = useState<{ row: number; index: number; nonce: number } | null>(null);
  const focusedIndicesRef = useRef({ row0: 0, row1: 0, row2: 0, row3: 0 });
  const prevFocusNonceRef = useRef(focusNonce);

  const initialRecentIdsRef = useRef<string[] | null>(null);
  if (initialRecentIdsRef.current === null && recentChannelIds.length > 0) {
    initialRecentIdsRef.current = recentChannelIds;
  }

  // Prioritize Live Channels: 10 total:
  // 1) Recently watched channels (frozen from session start so order is stable)
  // 2) Remaining channels in their natural guide order
  const displayLiveChannels = useMemo(() => {
    if (channels.length === 0) return [];
    const byId = new Map(channels.map((ch) => [ch.id, ch]));
    const effectiveRecent = initialRecentIdsRef.current || recentChannelIds;
    const recent = effectiveRecent
      .map((id) => byId.get(id))
      .filter((ch): ch is TvChannel => !!ch);

    const recentSet = new Set(recent.map((c) => c.id));
    const nonRecent = channels.filter((ch) => !recentSet.has(ch.id));

    const list = [...recent, ...nonRecent];
    if (activeChannelId && byId.has(activeChannelId)) {
      const activeCh = byId.get(activeChannelId)!;
      const idx = list.findIndex((c) => c.id === activeChannelId);
      if (idx > 9) {
        list.splice(idx, 1);
        list.splice(9, 0, activeCh);
      }
    }

    return list.slice(0, 10);
  }, [channels, recentChannelIds, activeChannelId]);

  // Limit New VOD to 10 latest items
  const displayNewVodItems = useMemo(() => {
    return newVodItems.slice(0, 10);
  }, [newVodItems]);

  const verticalScrollRef = useRef<ScrollView>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRowRef = useRef(0);
  const rowYPositions = useRef<Record<number, number>>({});

  const scrollToRow = useCallback((rowIndex: number) => {
    focusedRowRef.current = rowIndex;
    const fallbackY = rowIndex === 0 ? 0 : rowIndex === 1 ? 242 : rowIndex === 2 ? 494 : 746;
    const targetY = rowYPositions.current[rowIndex] ?? fallbackY;

    // Smoothly snap to section title directly below hero area in ONE single continuous motion
    verticalScrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
  }, []);

  // Restore focus to exact card when returning from fullscreen
  useEffect(() => {
    if (focusNonce > 0 && focusNonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusNonce;
      const targetRow = focusedRowRef.current;
      let targetIdx = 0;

      if (targetRow === 0) {
        targetIdx = Math.min(focusedIndicesRef.current.row0, displayLiveChannels.length - 1);
        if (displayLiveChannels[targetIdx]) {
          setFocusedChannel(displayLiveChannels[targetIdx]);
          setFocusedChannelId(displayLiveChannels[targetIdx].id);
        }
      } else if (targetRow === 1) {
        targetIdx = Math.min(focusedIndicesRef.current.row1, continueWatchingItems.length - 1);
      } else if (targetRow === 2) {
        targetIdx = Math.min(focusedIndicesRef.current.row2, displayNewVodItems.length - 1);
      } else {
        targetIdx = Math.min(focusedIndicesRef.current.row3, 6);
      }

      setCardFocusTarget({
        row: targetRow,
        index: Math.max(0, targetIdx),
        nonce: Date.now(),
      });
      scrollToRow(targetRow);
    }
  }, [
    focusNonce,
    displayLiveChannels,
    continueWatchingItems.length,
    displayNewVodItems.length,
    scrollToRow,
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelsRes, continueRes, newVodRes] = await Promise.allSettled([
        api.getLiveChannels(),
        vodProgressService.getContinueWatching(),
        api.getNewVodContent(),
      ]);
      const liveChannels = channelsRes.status === 'fulfilled' ? channelsRes.value : [];
      const continueList = continueRes.status === 'fulfilled' ? continueRes.value : [];
      const newVod = newVodRes.status === 'fulfilled' ? newVodRes.value : [];

      setChannels(liveChannels);
      setContinueWatchingItems(continueList);
      setNewVodItems(newVod);

      if (liveChannels.length === 0 && channelsRes.status === 'rejected') {
        setError(channelsRes.reason?.message || 'שגיאה בטעינת נתונים');
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic auto-update every 60 seconds (channels, continue watching, new vod)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [channelsRes, continueRes, newVodRes] = await Promise.allSettled([
          api.getLiveChannels(),
          vodProgressService.getContinueWatching(),
          api.getNewVodContent(),
        ]);
        if (channelsRes.status === 'fulfilled' && channelsRes.value.length > 0) {
          setChannels(channelsRes.value);
        }
        if (continueRes.status === 'fulfilled') {
          setContinueWatchingItems(continueRes.value);
        }
        if (newVodRes.status === 'fulfilled' && newVodRes.value.length > 0) {
          setNewVodItems(newVodRes.value);
        }
      } catch {}
    }, 60000);

    return () => {
      clearInterval(interval);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);


  // Once video is ready from the root player, hide artwork; otherwise keep artwork visible
  useEffect(() => {
    if (isVideoReady && activeStreamUrl) {
      setShowArtwork(false);
    } else {
      setShowArtwork(true);
    }
  }, [isVideoReady, activeStreamUrl]);

  // Synchronize focusedChannel with fresh guide data when channels update
  useEffect(() => {
    if (channels.length > 0) {
      const currentTargetId = focusedChannelId || activeChannelId;
      if (currentTargetId) {
        const fresh = channels.find((c) => c.id === currentTargetId);
        if (fresh) {
          setFocusedChannel(fresh);
        }
      }
    }
  }, [channels, focusedChannelId, activeChannelId]);

  const initialFocusDoneRef = useRef(false);

  // Set initial focus & preview on first channel after data loads (ONCE)
  useEffect(() => {
    if (initialFocusDoneRef.current) return;
    if (displayLiveChannels.length > 0) {
      initialFocusDoneRef.current = true;
      const initialChannel =
        (activeChannelId && displayLiveChannels.find((c) => c.id === activeChannelId)) ||
        displayLiveChannels[0];

      setFocusedChannel(initialChannel);
      setFocusedChannelId(initialChannel.id);
      const initialIdx = displayLiveChannels.findIndex((c) => c.id === initialChannel.id);
      if (initialIdx !== -1) {
        setFocusedLiveIndex(initialIdx);
      }

      const isAlreadyPlaying =
        (activeChannelId === initialChannel.id ||
          (activeStreamUrl && initialChannel.sources.some((s) => s.url === activeStreamUrl)) ||
          (activeStreamUrl && initialChannel.streamUrl === activeStreamUrl)) &&
        isVideoReady;

      if (!isAlreadyPlaying) {
        setShowArtwork(true);
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(async () => {
          let stream = initialChannel.streamUrl;
          if (!stream && initialChannel.rawChannel) {
            const resolved = await api.getLiveChannelStream(initialChannel.rawChannel);
            if (resolved) stream = resolved;
          }
          onMediaChange?.(stream, initialChannel.id);
        }, 2000);
      } else {
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        setShowArtwork(false);
      }
    }
  }, [displayLiveChannels, activeChannelId, activeStreamUrl, isVideoReady, onMediaChange]);

  // Channel focus handler: instant artwork, 2000ms timer before video plays
  const handleChannelFocus = useCallback((channel: TvChannel, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedLiveIndex(index);
    focusedIndicesRef.current.row0 = index;
    setFocusedChannelId(channel.id);

    if (focusedRowRef.current !== 0) {
      scrollToRow(0);
    }

    setFocusedRecent(null);
    setFocusedChannel(channel);

    const isAlreadyPlaying =
      (activeChannelId === channel.id ||
        (activeStreamUrl && channel.sources.some((s) => s.url === activeStreamUrl)) ||
        (activeStreamUrl && channel.streamUrl === activeStreamUrl)) &&
      isVideoReady;

    if (!isAlreadyPlaying) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      onMediaChange?.(null, null);
      setShowArtwork(true);
      previewTimerRef.current = setTimeout(async () => {
        let stream = channel.streamUrl;
        if (!stream && channel.rawChannel) {
          const resolved = await api.getLiveChannelStream(channel.rawChannel);
          if (resolved) stream = resolved;
        }
        onMediaChange?.(stream, channel.id);
      }, 2000);
    } else {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      setShowArtwork(false);
    }
  }, [activeChannelId, activeStreamUrl, isVideoReady, onMediaChange, scrollToRow]);

  // Continue Watching focus handler
  const handleContinueFocus = useCallback((item: ContinueWatchingItem, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedContinueIndex(index);
    focusedIndicesRef.current.row1 = index;
    setFocusedContinueId(item.episodeId);

    if (focusedRowRef.current !== 1) {
      scrollToRow(1);
    }

    setFocusedRecent(item);
    setFocusedChannelId(null);
    setShowArtwork(true);
    onMediaChange?.(null, null);

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const resolved = await api.getVodEpisodeStream(item);
      onMediaChange?.(resolved || null);
    }, 2000);
  }, [onMediaChange, scrollToRow]);

  // New VOD focus handler
  const handleNewVodFocus = useCallback((item: VodRecentItem, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedNewVodIndex(index);
    const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
    focusedIndicesRef.current.row2 = index;
    setFocusedNewVodId(item.episodeId);

    if (focusedRowRef.current !== newVodRow) {
      scrollToRow(newVodRow);
    }

    setFocusedRecent(item);
    setFocusedChannelId(null);
    setShowArtwork(true);
    onMediaChange?.(null, null);

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const resolved = await api.getVodEpisodeStream(item);
      onMediaChange?.(resolved || null);
    }, 2000);
  }, [continueWatchingItems.length, onMediaChange, scrollToRow]);

  // Shortcuts focus handler
  const handleShortcutFocus = useCallback((index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedShortcutIndex(index);
    const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
    focusedIndicesRef.current.row3 = index;
    setFocusedChannelId(null);

    if (focusedRowRef.current !== shortcutRow) {
      scrollToRow(shortcutRow);
    }

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onMediaChange?.(null, null);
    setShowArtwork(true);
  }, [continueWatchingItems.length, onMediaChange, scrollToRow]);

  // TV remote key listener for D-pad navigation
  useEffect(() => {
    if (isPlayerActive) return;

    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode }: { keyCode: number }) => {
        if (isPlayerActive) return;
        console.log('[DPAD]', keyCode, 'row:', focusedRowRef.current, 'isHero:', isHeroFocusedRef.current);

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (isHeroFocusedRef.current) {
            // Boundary at top: remain on Hero buttons
            return;
          }

          const currentRow = focusedRowRef.current;
          if (currentRow === 0) {
            // Requirement 1: Moving UP from Row 0 moves UP to Fullscreen icon
            isHeroFocusedRef.current = true;
            setHeroFocusButton('fullscreen');
            setHeroFocusNonce(Date.now());
          } else {
            // Requirement 3: Moving UP between sections
            let targetRow = 0;
            if (currentRow === 1) {
              targetRow = 0;
            } else if (currentRow === 2) {
              targetRow = continueWatchingItems.length > 0 ? 1 : 0;
            } else if (currentRow === 3) {
              if (displayNewVodItems.length > 0) {
                targetRow = continueWatchingItems.length > 0 ? 2 : 1;
              } else if (continueWatchingItems.length > 0) {
                targetRow = 1;
              } else {
                targetRow = 0;
              }
            }

            focusedRowRef.current = targetRow;
            const targetIdx =
              targetRow === 0
                ? Math.min(focusedIndicesRef.current.row0, displayLiveChannels.length - 1)
                : targetRow === 1
                ? Math.min(focusedIndicesRef.current.row1, continueWatchingItems.length - 1)
                : targetRow === 2
                ? Math.min(focusedIndicesRef.current.row2, displayNewVodItems.length - 1)
                : Math.min(focusedIndicesRef.current.row3, 6);

            setCardFocusTarget({
              row: targetRow,
              index: Math.max(0, targetIdx),
              nonce: Date.now(),
            });
            scrollToRow(targetRow);
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          if (isHeroFocusedRef.current) {
            // From Hero buttons, move DOWN back to Row 0
            isHeroFocusedRef.current = false;
            setHeroFocusButton(null);
            focusedRowRef.current = 0;
            const targetIdx = Math.min(
              focusedIndicesRef.current.row0,
              displayLiveChannels.length - 1
            );
            setCardFocusTarget({
              row: 0,
              index: Math.max(0, targetIdx),
              nonce: Date.now(),
            });
            scrollToRow(0);
            return;
          }

          // Moving DOWN between sections
          const currentRow = focusedRowRef.current;
          const totalRows = continueWatchingItems.length > 0 ? 4 : 3;
          const maxRowIndex = totalRows - 1;

          if (currentRow >= maxRowIndex) {
            // Bottom boundary: stay on current row/card, do not jump
            setCardFocusTarget({
              row: currentRow,
              index: focusedIndicesRef.current.row3,
              nonce: Date.now(),
            });
            return;
          }

          let targetRow = currentRow + 1;
          focusedRowRef.current = targetRow;

          const targetIdx =
            targetRow === 1
              ? Math.min(focusedIndicesRef.current.row1, continueWatchingItems.length - 1)
              : targetRow === 2
              ? Math.min(focusedIndicesRef.current.row2, displayNewVodItems.length - 1)
              : Math.min(focusedIndicesRef.current.row3, 6);

          setCardFocusTarget({
            row: targetRow,
            index: Math.max(0, targetIdx),
            nonce: Date.now(),
          });
          scrollToRow(targetRow);
        }
        // DPAD_RIGHT = 22
        else if (keyCode === 22) {
          if (isHeroFocusedRef.current) {
            if (heroFocusButton === 'fullscreen' && onToggleMute) {
              setHeroFocusButton('mute');
              setHeroFocusNonce(Date.now());
            }
            return;
          }
          // Native Android handles rightward navigation within the row.
          // At the last card, lockRight keeps focus securely on that card.
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (isHeroFocusedRef.current) {
            if (heroFocusButton === 'mute') {
              setHeroFocusButton('fullscreen');
              setHeroFocusNonce(Date.now());
            } else if (heroFocusButton === 'fullscreen') {
              // Left from fullscreen hero button moves to side navigation rail
              onRequestSideNavFocus?.(AppDestination.HOME);
            }
            return;
          }

          // Requirement 4: שמאלה עד הסוף צריך לעבור לתפריט בראשי לפרק שמסומן
          const currentRow = focusedRowRef.current;
          let isAtStart = false;

          if (currentRow === 0) {
            isAtStart = focusedLiveIndex === 0;
          } else if (currentRow === 1 && continueWatchingItems.length > 0) {
            isAtStart = focusedContinueIndex === 0;
          } else if (currentRow === (continueWatchingItems.length > 0 ? 2 : 1)) {
            isAtStart = focusedNewVodIndex === 0;
          } else {
            isAtStart = focusedShortcutIndex === 0;
          }

          if (isAtStart) {
            onRequestSideNavFocus?.(AppDestination.HOME);
          }
        }
      }
    );

    return () => {
      sub.remove();
    };
  }, [
    isPlayerActive,
    displayLiveChannels.length,
    continueWatchingItems.length,
    displayNewVodItems.length,
    focusedLiveIndex,
    focusedContinueIndex,
    focusedNewVodIndex,
    focusedShortcutIndex,
    heroFocusButton,
    onToggleMute,
    onRequestSideNavFocus,
    scrollToRow,
  ]);

  // Active item for Hero & Artwork
  const isRecentFocused = !!focusedRecent;
  const activeChannel = focusedChannel || displayLiveChannels[0] || null;
  const activeProgram = activeChannel?.currentProgram;

  const heroTitle = isRecentFocused
    ? focusedRecent.title
    : activeProgram?.title || activeChannel?.name || 'טלוויזיה חיה';

  const heroSubtitle = isRecentFocused
    ? focusedRecent.seriesTitle || focusedRecent.channelName || 'המשך צפייה'
    : activeChannel?.name || 'שידור חי';

  const heroDescription = isRecentFocused
    ? (focusedRecent.description || focusedRecent.rawItem?.description || focusedRecent.rawItem?.desc || '')
    : activeProgram?.description || '';

  const heroTimeRange = isRecentFocused ? undefined : activeProgram?.timeRange;

  const heroChannelLogoUrl = isRecentFocused
    ? focusedRecent.channelLogo
    : activeChannel?.logoUrl;

  const backgroundImageUrl = isRecentFocused
    ? (focusedRecent.imageUrl ? resolveImageUrl(focusedRecent.imageUrl, true) : null)
    : activeProgram?.backdropUrl || (activeProgram?.imageUrl ? resolveImageUrl(activeProgram.imageUrl, true) : activeChannel?.logoUrl);

  const handleOpenFullScreen = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (isRecentFocused && focusedRecent) {
      onPlayRecentVod?.(focusedRecent);
    } else if (activeChannel) {
      onPlayChannel(activeChannel, activeProgram);
    }
  }, [isRecentFocused, focusedRecent, activeChannel, activeProgram, onPlayRecentVod, onPlayChannel]);

  const handlePlayLiveCard = useCallback((channel: TvChannel) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onPlayChannel(channel, channel.currentProgram);
  }, [onPlayChannel]);

  const handlePlayVodCard = useCallback((item: VodRecentItem) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onPlayRecentVod?.(item);
  }, [onPlayRecentVod]);

  return (
    <TvScreenLayout
      backgroundImageUrl={backgroundImageUrl}
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroDescription={heroDescription}
      heroTimeRange={heroTimeRange}
      heroChannelLogoUrl={heroChannelLogoUrl}
      isLive={!isRecentFocused}
      showVodBadge={isRecentFocused}
      hasExternalPlayer={true}
      showArtwork={showArtwork}
      isMuted={isMuted}
      actions={
        <HeroActions
          onOpenFullScreen={handleOpenFullScreen}
          onToggleMute={onToggleMute}
          isMuted={isMuted}
          focusTargetButton={heroFocusButton}
          focusNonce={heroFocusNonce}
          onFocusAction={(btn) => {
            isHeroFocusedRef.current = true;
            setHeroFocusButton(btn);
          }}
          onBlurAction={() => {
            isHeroFocusedRef.current = false;
          }}
        />
      }
    >
      {loading && displayLiveChannels.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#E2E8F0" />
        </View>
      ) : error && displayLiveChannels.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          ref={verticalScrollRef}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          scrollsChildToFocus={false}
          contentContainerStyle={styles.rowsContent}
        >
          {/* Row 1: ערוצים חיים (Exactly 10 items, prioritized) */}
          {displayLiveChannels.length > 0 && (
            <HomeRow
              title="ערוצים חיים"
              onLayout={(e) => {
                rowYPositions.current[0] = e.nativeEvent.layout.y;
              }}
            >
              {displayLiveChannels.map((channel, index) => {
                const isTargeted = cardFocusTarget?.row === 0 && cardFocusTarget?.index === index;

                return (
                  <HomeLiveCard
                    key={channel.id}
                    channel={channel}
                    program={channel.currentProgram}
                    onPress={() => handlePlayLiveCard(channel)}
                    onFocus={() => handleChannelFocus(channel, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : 0}
                    isFirstCard={index === 0}
                    isLastCard={index === displayLiveChannels.length - 1}
                    hasPreferredFocus={
                      isTargeted || (!hasHadInitialFocus && index === 0)
                    }
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 2: המשך צפייה (Watched & unfinished only) */}
          {continueWatchingItems.length > 0 && (
            <HomeRow
              title="המשך צפייה"
              onLayout={(e) => {
                rowYPositions.current[1] = e.nativeEvent.layout.y;
              }}
            >
              {continueWatchingItems.map((item, index) => {
                const isTargeted = cardFocusTarget?.row === 1 && cardFocusTarget?.index === index;

                return (
                  <HomeContinueCard
                    key={`continue_${item.episodeId}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleContinueFocus(item, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : 0}
                    isFirstCard={index === 0}
                    isLastCard={index === continueWatchingItems.length - 1}
                    hasPreferredFocus={isTargeted}
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 3: תכני VOD חדשים (Top 10 latest) */}
          {displayNewVodItems.length > 0 && (
            <HomeRow
              title="תכני VOD חדשים"
              onLayout={(e) => {
                const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
                rowYPositions.current[newVodRow] = e.nativeEvent.layout.y;
              }}
            >
              {displayNewVodItems.map((item, index) => {
                const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
                const isTargeted = cardFocusTarget?.row === newVodRow && cardFocusTarget?.index === index;

                return (
                  <HomeContinueCard
                    key={`new_vod_${item.episodeId}_${index}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleNewVodFocus(item, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : 0}
                    isFirstCard={index === 0}
                    isLastCard={index === displayNewVodItems.length - 1}
                    hasPreferredFocus={isTargeted}
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 4: עוד לצפות (Shortcuts & Providers) */}
          <HomeRow
            title="עוד לצפות"
            onLayout={(e) => {
              const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
              rowYPositions.current[shortcutRow] = e.nativeEvent.layout.y;
            }}
          >
            {(() => {
              const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
              const isTargeted = (idx: number) => cardFocusTarget?.row === shortcutRow && cardFocusTarget?.index === idx;
              const getNonce = (idx: number) => isTargeted(idx) ? cardFocusTarget!.nonce : 0;
              const isPref = (idx: number) => isTargeted(idx);

              return (
                <>
                  <ShortcutCard
                    title="Live TV"
                    subtitle="כל הערוצים החיים"
                    iconName="live"
                    onPress={() => onNavigateDestination?.(AppDestination.LIVE_TV)}
                    onFocus={() => handleShortcutFocus(0)}
                    focusNonce={getNonce(0)}
                    isFirstCard={true}
                    isLastCard={false}
                    hasPreferredFocus={isPref(0)}
                  />
                  <ShortcutCard
                    title="VOD"
                    subtitle="ספריות הערוצים"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(1)}
                    focusNonce={getNonce(1)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(1)}
                  />
                  <ShortcutCard
                    title="כאן 11"
                    subtitle="VOD 11"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(2)}
                    focusNonce={getNonce(2)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(2)}
                  />
                  <ShortcutCard
                    title="קשת 12"
                    subtitle="VOD 12"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(3)}
                    focusNonce={getNonce(3)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(3)}
                  />
                  <ShortcutCard
                    title="רשת 13"
                    subtitle="VOD 13"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(4)}
                    focusNonce={getNonce(4)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(4)}
                  />
                  <ShortcutCard
                    title="עכשיו 14"
                    subtitle="VOD 14"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(5)}
                    focusNonce={getNonce(5)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(5)}
                  />
                  <ShortcutCard
                    title="i24NEWS"
                    subtitle="VOD 15"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(6)}
                    focusNonce={getNonce(6)}
                    isFirstCard={false}
                    isLastCard={true}
                    hasPreferredFocus={isPref(6)}
                  />
                </>
              );
            })()}
          </HomeRow>
        </ScrollView>
      )}
    </TvScreenLayout>
  );
});

const styles = StyleSheet.create({
  rowsContent: {
    paddingBottom: 160,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    color: '#F04438',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default HomeScreen;
