import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text } from 'react-native';
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
  recentChannelIds?: string[];
  activeStreamUrl?: string | null;
  isVideoReady?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onMediaChange?: (streamUrl: string | null, channelId?: string | null) => void;
  focusNonce?: number;
  activeChannelId?: string | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = React.memo(({
  onPlayChannel,
  onPlayRecentVod,
  onNavigateDestination,
  recentChannelIds = [],
  activeStreamUrl,
  isVideoReady = false,
  isMuted = true,
  onToggleMute,
  onMediaChange,
  focusNonce = 0,
  activeChannelId,
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

  const [restoringFocusTarget, setRestoringFocusTarget] = useState<{ row: number; id: string } | null>(null);
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
      let targetRow = focusedRowRef.current;
      let targetId = '';

      if (activeChannelId) {
        // Active live channel is playing - restore focus to Row 0 on that channel
        targetRow = 0;
        targetId = activeChannelId;
        focusedRowRef.current = 0;
      } else if (targetRow === 0) {
        targetId = focusedChannelId || displayLiveChannels[0]?.id || '';
      } else if (targetRow === 1) {
        targetId = focusedContinueId || '';
      } else if (targetRow === 2) {
        targetId = focusedNewVodId || '';
      }

      if (targetRow === 0 && targetId) {
        const liveIdx = displayLiveChannels.findIndex((c) => c.id === targetId);
        if (liveIdx !== -1) {
          setFocusedLiveIndex(liveIdx);
          setFocusedChannelId(targetId);
          setFocusedChannel(displayLiveChannels[liveIdx]);
          setFocusedRecent(null);
        }
      }

      if (isVideoReady && activeStreamUrl) {
        setShowArtwork(false);
      }

      scrollToRow(targetRow);

      setRestoringFocusTarget({ row: targetRow, id: targetId });
      const timer = setTimeout(() => {
        setRestoringFocusTarget(null);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [
    focusNonce,
    activeChannelId,
    focusedChannelId,
    focusedContinueId,
    focusedNewVodId,
    displayLiveChannels,
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
    setFocusedLiveIndex(index);
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
    setFocusedContinueIndex(index);
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
    setFocusedNewVodIndex(index);
    setFocusedNewVodId(item.episodeId);
    const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;

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
    setFocusedShortcutIndex(index);
    setFocusedChannelId(null);
    const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;

    if (focusedRowRef.current !== shortcutRow) {
      scrollToRow(shortcutRow);
    }

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onMediaChange?.(null, null);
    setShowArtwork(true);
  }, [continueWatchingItems.length, onMediaChange, scrollToRow]);

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
                const isCurrentlyFocusedLiveCard =
                  focusedRowRef.current === 0 &&
                  channel.id === (focusedChannelId || activeChannelId);

                return (
                  <HomeLiveCard
                    key={channel.id}
                    channel={channel}
                    program={channel.currentProgram}
                    onPress={() => handlePlayLiveCard(channel)}
                    onFocus={() => handleChannelFocus(channel, index)}
                    focusNonce={focusNonce}
                    hasPreferredFocus={
                      (!hasHadInitialFocus && index === 0) ||
                      (restoringFocusTarget?.row === 0
                        ? (restoringFocusTarget.id ? channel.id === restoringFocusTarget.id : index === focusedLiveIndex)
                        : isCurrentlyFocusedLiveCard)
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
                const isCurrentlyFocusedContinue =
                  focusedRowRef.current === 1 &&
                  (item.episodeId === focusedContinueId || index === focusedContinueIndex);

                return (
                  <HomeContinueCard
                    key={`continue_${item.episodeId}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleContinueFocus(item, index)}
                    focusNonce={focusNonce}
                    hasPreferredFocus={
                      restoringFocusTarget?.row === 1
                        ? (restoringFocusTarget.id ? item.episodeId === restoringFocusTarget.id : index === focusedContinueIndex)
                        : isCurrentlyFocusedContinue
                    }
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
                const isCurrentlyFocusedNewVod =
                  focusedRowRef.current === newVodRow &&
                  (item.episodeId === focusedNewVodId || index === focusedNewVodIndex);

                return (
                  <HomeContinueCard
                    key={`new_vod_${item.episodeId}_${index}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleNewVodFocus(item, index)}
                    focusNonce={focusNonce}
                    hasPreferredFocus={
                      restoringFocusTarget?.row === newVodRow
                        ? (restoringFocusTarget.id ? item.episodeId === restoringFocusTarget.id : index === focusedNewVodIndex)
                        : isCurrentlyFocusedNewVod
                    }
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
            <ShortcutCard
              title="Live TV"
              subtitle="כל הערוצים החיים"
              iconName="live"
              onPress={() => onNavigateDestination?.(AppDestination.LIVE_TV)}
              onFocus={() => handleShortcutFocus(0)}
              hasPreferredFocus={
                restoringFocusTarget?.row === (continueWatchingItems.length > 0 ? 3 : 2) &&
                focusedShortcutIndex === 0
              }
            />
            <ShortcutCard
              title="VOD"
              subtitle="ספריות הערוצים"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(1)}
              hasPreferredFocus={
                restoringFocusTarget?.row === (continueWatchingItems.length > 0 ? 3 : 2) &&
                focusedShortcutIndex === 1
              }
            />
            <ShortcutCard
              title="כאן 11"
              subtitle="VOD 11"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(2)}
            />
            <ShortcutCard
              title="קשת 12"
              subtitle="VOD 12"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(3)}
            />
            <ShortcutCard
              title="רשת 13"
              subtitle="VOD 13"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(4)}
            />
            <ShortcutCard
              title="עכשיו 14"
              subtitle="VOD 14"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(5)}
            />
            <ShortcutCard
              title="i24NEWS"
              subtitle="VOD 15"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(6)}
            />
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
