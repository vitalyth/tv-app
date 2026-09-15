import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text } from 'react-native';
import { AppDestination, TvChannel, TvProgram } from '../types/guide';
import { VodRecentItem } from '../types/vod';
import { api } from '../services/api';
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
  const [showArtwork, setShowArtwork] = useState(true);
  const [hasHadInitialFocus, setHasHadInitialFocus] = useState(false);

  const [focusedLiveIndex, setFocusedLiveIndex] = useState(0);
  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(null);
  const [focusedContinueIndex, setFocusedContinueIndex] = useState(0);
  const [focusedNewVodIndex, setFocusedNewVodIndex] = useState(0);
  const [focusedShortcutIndex, setFocusedShortcutIndex] = useState(0);

  const initialRecentIdsRef = useRef<string[] | null>(null);
  if (initialRecentIdsRef.current === null && recentChannelIds.length > 0) {
    initialRecentIdsRef.current = recentChannelIds;
  }

  const verticalScrollRef = useRef<ScrollView>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRowRef = useRef(0);

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

  // Prioritize Live Channels: 10 total:
  // 1) Recently watched channels (frozen from session start so order is stable)
  // 2) Channels whose current program started most recently
  // 3) Remaining channels
  const displayLiveChannels = useMemo(() => {
    if (channels.length === 0) return [];
    const byId = new Map(channels.map((ch) => [ch.id, ch]));
    const effectiveRecent = initialRecentIdsRef.current || recentChannelIds;
    const recent = effectiveRecent
      .map((id) => byId.get(id))
      .filter((ch): ch is TvChannel => !!ch);

    const recentSet = new Set(recent.map((c) => c.id));
    const nonRecent = channels.filter((ch) => !recentSet.has(ch.id));

    // Sort non-recent by programs started most recently
    nonRecent.sort((a, b) => {
      const aStart = a.currentProgram?.startSeconds || 0;
      const bStart = b.currentProgram?.startSeconds || 0;
      return bStart - aStart;
    });

    return [...recent, ...nonRecent].slice(0, 10);
  }, [channels]);

  // Limit New VOD to 10 latest items
  const displayNewVodItems = useMemo(() => {
    return newVodItems.slice(0, 10);
  }, [newVodItems]);

  // Once video is ready from the root player, hide artwork
  useEffect(() => {
    if (isVideoReady && activeStreamUrl) {
      setShowArtwork(false);
    }
  }, [isVideoReady, activeStreamUrl]);

  // Set initial focus & preview on first channel after data loads
  useEffect(() => {
    if (displayLiveChannels.length > 0 && !focusedChannel && !focusedRecent) {
      const firstCh = displayLiveChannels[0];
      setFocusedChannel(firstCh);
      setFocusedChannelId(firstCh.id);
      const isAlreadyPlaying =
        (activeChannelId === firstCh.id || !activeChannelId) &&
        !!activeStreamUrl &&
        isVideoReady;

      if (!isAlreadyPlaying) {
        setShowArtwork(true);
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(async () => {
          let stream = firstCh.streamUrl;
          if (firstCh.rawChannel) {
            const resolved = await api.getLiveChannelStream(firstCh.rawChannel);
            if (resolved) stream = resolved;
          }
          onMediaChange?.(stream, firstCh.id);
        }, 2000);
      } else {
        setShowArtwork(false);
      }
    }
  }, [displayLiveChannels, focusedChannel, focusedRecent, activeChannelId, activeStreamUrl, isVideoReady, onMediaChange]);

  // Channel focus handler: instant artwork, 2000ms timer before video plays
  const handleChannelFocus = useCallback((channel: TvChannel, index: number) => {
    setHasHadInitialFocus(true);
    setFocusedLiveIndex(index);
    setFocusedChannelId(channel.id);
    if (focusedRowRef.current !== 0) {
      focusedRowRef.current = 0;
      verticalScrollRef.current?.scrollTo({ y: 0, animated: true });
    }

    setFocusedRecent(null);
    setFocusedChannel(channel);

    const isAlreadyPlaying =
      (activeChannelId === channel.id || (activeChannel?.id === channel.id)) &&
      !!activeStreamUrl &&
      isVideoReady;

    if (!isAlreadyPlaying) {
      onMediaChange?.(null, null);
      setShowArtwork(true);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(async () => {
        let stream = channel.streamUrl;
        if (channel.rawChannel) {
          const resolved = await api.getLiveChannelStream(channel.rawChannel);
          if (resolved) stream = resolved;
        }
        onMediaChange?.(stream, channel.id);
      }, 2000);
    } else {
      setShowArtwork(false);
    }
  }, [activeChannelId, activeChannel?.id, activeStreamUrl, isVideoReady, onMediaChange]);

  // Continue Watching focus handler
  const handleContinueFocus = useCallback((item: ContinueWatchingItem, index: number) => {
    setHasHadInitialFocus(true);
    setFocusedContinueIndex(index);
    if (focusedRowRef.current !== 1) {
      focusedRowRef.current = 1;
      verticalScrollRef.current?.scrollTo({ y: 230, animated: true });
    }

    setFocusedRecent(item);
    setFocusedChannelId(null);
    setShowArtwork(true);
    onMediaChange?.(null, null);

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const isDirect =
        item.playUrl &&
        (item.playUrl.includes('.m3u8') ||
          item.playUrl.includes('.mp4') ||
          item.playUrl.includes('.mpd'));
      let stream = isDirect ? item.playUrl : null;
      if (!stream) {
        const resolved = await api.getVodEpisodeStream(item);
        if (resolved) stream = resolved;
      }
      onMediaChange?.(stream || null);
    }, 2000);
  }, [onMediaChange]);

  // New VOD focus handler
  const handleNewVodFocus = useCallback((item: VodRecentItem, index: number) => {
    setHasHadInitialFocus(true);
    setFocusedNewVodIndex(index);
    const targetRow = continueWatchingItems.length > 0 ? 2 : 1;
    const targetY = continueWatchingItems.length > 0 ? 470 : 230;
    if (focusedRowRef.current !== targetRow) {
      focusedRowRef.current = targetRow;
      verticalScrollRef.current?.scrollTo({ y: targetY, animated: true });
    }

    setFocusedRecent(item);
    setFocusedChannelId(null);
    setShowArtwork(true);
    onMediaChange?.(null, null);

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const isDirect =
        item.playUrl &&
        (item.playUrl.includes('.m3u8') ||
          item.playUrl.includes('.mp4') ||
          item.playUrl.includes('.mpd'));
      let stream = isDirect ? item.playUrl : null;
      if (!stream) {
        const resolved = await api.getVodEpisodeStream(item);
        if (resolved) stream = resolved;
      }
      onMediaChange?.(stream || null);
    }, 2000);
  }, [continueWatchingItems.length, onMediaChange]);

  // Shortcuts focus handler
  const handleShortcutFocus = useCallback((index: number) => {
    setHasHadInitialFocus(true);
    setFocusedShortcutIndex(index);
    setFocusedChannelId(null);
    const targetRow = continueWatchingItems.length > 0 ? 3 : 2;
    const targetY = continueWatchingItems.length > 0 ? 710 : 470;
    if (focusedRowRef.current !== targetRow) {
      focusedRowRef.current = targetRow;
      verticalScrollRef.current?.scrollTo({ y: targetY, animated: true });
    }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onMediaChange?.(null, null);
    setShowArtwork(true);
  }, [continueWatchingItems.length, onMediaChange]);

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
    ? focusedRecent.imageUrl
    : activeProgram?.imageUrl || activeChannel?.logoUrl;

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
          contentContainerStyle={styles.rowsContent}
        >
          {/* Row 1: ערוצים חיים (Exactly 10 items, prioritized) */}
          {displayLiveChannels.length > 0 && (
            <HomeRow title="ערוצים חיים" focusedIndex={focusedLiveIndex} cardWidth={252}>
              {displayLiveChannels.map((channel, index) => (
                <HomeLiveCard
                  key={channel.id}
                  channel={channel}
                  program={channel.currentProgram}
                  onPress={() => handlePlayLiveCard(channel)}
                  onFocus={() => handleChannelFocus(channel, index)}
                  focusNonce={focusNonce}
                  hasPreferredFocus={
                    (!hasHadInitialFocus && index === 0) ||
                    (focusNonce > 0 && focusedRowRef.current === 0 && index === focusedLiveIndex)
                  }
                />
              ))}
            </HomeRow>
          )}

          {/* Row 2: המשך צפייה (Watched & unfinished only) */}
          {continueWatchingItems.length > 0 && (
            <HomeRow title="המשך צפייה" focusedIndex={focusedContinueIndex} cardWidth={252}>
              {continueWatchingItems.map((item, index) => (
                <HomeContinueCard
                  key={`continue_${item.episodeId}`}
                  item={item}
                  onPress={() => handlePlayVodCard(item)}
                  onFocus={() => handleContinueFocus(item, index)}
                  focusNonce={focusNonce}
                  hasPreferredFocus={
                    focusNonce > 0 && focusedRowRef.current === 1 && index === focusedContinueIndex
                  }
                />
              ))}
            </HomeRow>
          )}

          {/* Row 3: תכני VOD חדשים (Top 10 latest) */}
          {displayNewVodItems.length > 0 && (
            <HomeRow title="תכני VOD חדשים" focusedIndex={focusedNewVodIndex} cardWidth={252}>
              {displayNewVodItems.map((item, index) => (
                <HomeContinueCard
                  key={`new_vod_${item.episodeId}_${index}`}
                  item={item}
                  onPress={() => handlePlayVodCard(item)}
                  onFocus={() => handleNewVodFocus(item, index)}
                  focusNonce={focusNonce}
                  hasPreferredFocus={
                    focusNonce > 0 &&
                    focusedRowRef.current === (continueWatchingItems.length > 0 ? 2 : 1) &&
                    index === focusedNewVodIndex
                  }
                />
              ))}
            </HomeRow>
          )}

          {/* Row 4: עוד לצפות (Shortcuts & Providers) */}
          <HomeRow title="עוד לצפות" focusedIndex={focusedShortcutIndex} cardWidth={216}>
            <ShortcutCard
              title="Live TV"
              subtitle="כל הערוצים החיים"
              iconName="live"
              onPress={() => onNavigateDestination?.(AppDestination.LIVE_TV)}
              onFocus={() => handleShortcutFocus(0)}
            />
            <ShortcutCard
              title="VOD"
              subtitle="ספריות הערוצים"
              iconName="vod"
              onPress={() => onNavigateDestination?.(AppDestination.VOD)}
              onFocus={() => handleShortcutFocus(1)}
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
