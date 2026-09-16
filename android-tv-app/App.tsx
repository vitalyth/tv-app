import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { AppDestination, TvChannel, TvProgram } from './src/types/guide';
import { VodEpisode, VodSeries, VodRecentItem } from './src/types/vod';
import { TvNavContext } from './src/context/TvNavContext';
import AppSideNavRail from './src/components/layout/AppSideNavRail';
import HomeScreen from './src/screens/HomeScreen';
import LiveTvScreen from './src/screens/LiveTvScreen';
import VodScreen from './src/screens/VodScreen';
import LivePlayerOverlay from './src/components/player/LivePlayerOverlay';
import VodPlayerOverlay from './src/components/player/VodPlayerOverlay';
import AppSplashScreen from './src/components/common/AppSplashScreen';
import { api } from './src/services/api';
import { vodProgressService, ContinueWatchingItem } from './src/services/vodProgress';
import { getStreamType } from './src/utils/stream';

interface FullscreenPlayerState {
  streamUrl?: string | null;
  title: string;
  channel?: TvChannel | null;
  program?: TvProgram | null;
  episode?: VodEpisode | null;
  series?: VodSeries | null;
  recentItem?: VodRecentItem | null;
  resumePositionMs?: number;
  isResolving?: boolean;
}

export default function App() {
  const [currentDestination, setCurrentDestination] = useState<AppDestination>(AppDestination.HOME);
  const [fullscreenPlayer, setFullscreenPlayer] = useState<FullscreenPlayerState | null>(null);
  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([]);
  const [newVodItems, setNewVodItems] = useState<VodRecentItem[]>([]);
  const [recentChannelIds, setRecentChannelIds] = useState<string[]>([]);
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isAppBootLoading, setIsAppBootLoading] = useState(true);

  // Single persistent Video player state (1:1 with native primaryPlayer)
  const globalVideoRef = useRef<VideoRef>(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [vodDuration, setVodDuration] = useState(0);
  const [vodCurrentTime, setVodCurrentTime] = useState(0);
  const vodDurationRef = useRef<number>(0);
  const vodCurrentTimeRef = useRef<number>(0);
  const hasResumedSeekRef = useRef<boolean>(false);
  const lastProgressSaveRef = useRef<number>(0);
  const [sideNavFocusTarget, setSideNavFocusTarget] = useState<{
    destination: AppDestination;
    nonce: number;
  } | null>(null);

  const handleRequestSideNavFocus = useCallback((dest: AppDestination) => {
    setIsRailExpanded(true);
    setSideNavFocusTarget({
      destination: dest,
      nonce: Date.now(),
    });
    setTimeout(() => {
      setSideNavFocusTarget(null);
    }, 150);
  }, []);

  const handleReturnFocusToScreen = useCallback(() => {
    setIsRailExpanded(false);
    setFocusNonce(Date.now());
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.getLiveChannels().then((res) => setChannels(res)),
      vodProgressService.getContinueWatching().then((res) => setContinueWatchingItems(res)),
      vodProgressService.getRecentChannels().then((ids) => setRecentChannelIds(ids)),
      vodProgressService.getMutePreference().then((saved) => {
        if (typeof saved === 'boolean') {
          setIsMuted(saved);
        }
      }),
      api.getNewVodContent().then((res) => setNewVodItems(res)),
      api.getGuideData().catch(() => {}),
    ]).finally(() => {
      setIsAppBootLoading(false);
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      vodProgressService.saveMutePreference(next).catch(() => {});
      return next;
    });
  }, []);

  const handleChannelRecentSaved = useCallback((channelId: string) => {
    vodProgressService.saveRecentChannel(channelId).catch(() => {});
  }, []);

  const handlePlayChannel = useCallback(
    async (channel: TvChannel, program?: TvProgram | null) => {
      handleChannelRecentSaved(channel.id);
      setActiveChannelId(channel.id);

      const isAlreadyPlaying =
        (activeChannelId === channel.id ||
          (activeStreamUrl && channel.sources.some((s) => s.url === activeStreamUrl))) &&
        isVideoReady;

      let stream = isAlreadyPlaying ? activeStreamUrl : channel.streamUrl;

      if (!isAlreadyPlaying) {
        setIsVideoReady(false);
        if (!stream && channel.rawChannel) {
          const resolved = await api.getLiveChannelStream(channel.rawChannel);
          if (resolved) stream = resolved;
        }
        if (stream && activeStreamUrl !== stream) {
          setActiveStreamUrl(stream);
        }
      }
      setIsPaused(false);
      setFullscreenPlayer({
        streamUrl: stream,
        title: program?.title || channel.name,
        channel,
        program,
      });
    },
    [activeChannelId, activeStreamUrl, isVideoReady, handleChannelRecentSaved]
  );

  const handleSelectChannelInPlayer = useCallback(
    async (channel: TvChannel) => {
      handleChannelRecentSaved(channel.id);
      setActiveChannelId(channel.id);
      let stream = channel.streamUrl;
      setIsVideoReady(false);
      if (!stream && channel.rawChannel) {
        const resolved = await api.getLiveChannelStream(channel.rawChannel);
        if (resolved) stream = resolved;
      }
      if (stream && activeStreamUrl !== stream) {
        setActiveStreamUrl(stream);
      }
      setFullscreenPlayer((prev) => ({
        ...prev,
        streamUrl: stream,
        channel,
        title: channel.currentProgram?.title || channel.name,
        program: channel.currentProgram,
      }));
    },
    [activeStreamUrl, handleChannelRecentSaved]
  );

  const handleSelectSourceUrl = useCallback((url: string) => {
    if (url && activeStreamUrl !== url) {
      setActiveStreamUrl(url);
      setIsVideoReady(false);
    }
    setFullscreenPlayer((prev) => (prev ? { ...prev, streamUrl: url } : null));
  }, [activeStreamUrl]);

  const handleSaveProgress = useCallback(
    (
      episodeId: string,
      seriesId?: string | null,
      positionMs?: number,
      durationMs?: number,
      item?: VodRecentItem | null
    ) => {
      if (!episodeId || positionMs === undefined) return;
      vodProgressService.saveProgress(
        episodeId,
        seriesId,
        positionMs,
        durationMs || 0,
        item
      );
    },
    []
  );

  const handlePlayRecentVod = useCallback(async (item: VodRecentItem) => {
    hasResumedSeekRef.current = false;
    vodCurrentTimeRef.current = 0;
    vodDurationRef.current = 0;
    setActiveChannelId(null);

    let resumePositionMs = 0;
    let saved = null;
    if (item.episodeId) {
      saved = await vodProgressService.getProgress(item.episodeId);
    }
    const pos = saved?.positionMs ?? (item as any).positionMs ?? 0;
    const dur = saved?.durationMs ?? (item as any).durationMs ?? 0;
    const isCompleted = saved?.isCompleted ?? (item as any).isCompleted ?? false;
    const ratio = dur > 0 ? pos / dur : 0;

    // Resume if not completed, watched at least 1s, and more than 25s remaining
    if (!isCompleted && pos > 1000 && (dur === 0 || dur - pos > 25000)) {
      resumePositionMs = pos;
    } else {
      resumePositionMs = 0;
    }

    setIsPaused(false);
    setFullscreenPlayer({
      streamUrl: null,
      title: item.title,
      recentItem: item,
      resumePositionMs,
      isResolving: true,
    });

    const resolved = await api.getVodEpisodeStream(item);
    if (resolved) {
      setActiveStreamUrl(resolved);
      setIsVideoReady(false);
      setFullscreenPlayer((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          streamUrl: resolved,
          isResolving: false,
        };
      });
    } else {
      setFullscreenPlayer((prev) => (prev ? { ...prev, isResolving: false } : null));
    }
  }, []);

  const handlePlayEpisode = useCallback(async (episode: VodEpisode, series: VodSeries) => {
    hasResumedSeekRef.current = false;
    vodCurrentTimeRef.current = 0;
    vodDurationRef.current = 0;
    setActiveChannelId(null);

    const savedProgress = await vodProgressService.getProgress(episode.id);
    let resumePositionMs = 0;
    if (savedProgress) {
      const pos = savedProgress.positionMs || 0;
      const dur = savedProgress.durationMs || 0;
      if (!savedProgress.isCompleted && pos > 1000 && (dur === 0 || dur - pos > 25000)) {
        resumePositionMs = pos;
      }
    }

    setIsPaused(false);
    setFullscreenPlayer({
      streamUrl: null,
      title: episode.title,
      episode,
      series,
      resumePositionMs,
      isResolving: true,
    });

    const providerKey = series.provider || (series.providerId as any) || 'kan-vod';
    const resolved = await api.resolveEpisodeStream(
      episode.streamEndpoint,
      providerKey,
      episode.playUrl,
      episode.id
    );

    if (resolved) {
      setActiveStreamUrl(resolved);
      setIsVideoReady(false);
      setFullscreenPlayer((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          streamUrl: resolved,
          isResolving: false,
        };
      });
    } else {
      setFullscreenPlayer((prev) => (prev ? { ...prev, isResolving: false } : null));
    }
  }, []);

  const handleClosePlayer = useCallback(() => {
    if (fullscreenPlayer && !fullscreenPlayer.channel) {
      const episodeId =
        fullscreenPlayer.episode?.id ||
        fullscreenPlayer.recentItem?.episodeId ||
        (fullscreenPlayer.recentItem as any)?.id;
      const currentPos = vodCurrentTimeRef.current;
      const currentDur = vodDurationRef.current;
      if (episodeId && currentPos > 1) {
        const seriesId =
          fullscreenPlayer.series?.id || fullscreenPlayer.recentItem?.seriesId;
        const posMs = Math.floor(currentPos * 1000);
        const durMs = Math.floor(currentDur * 1000);
        const itemToSave =
          fullscreenPlayer.recentItem
            ? {
                ...fullscreenPlayer.recentItem,
                playUrl: fullscreenPlayer.streamUrl || fullscreenPlayer.recentItem.playUrl,
              }
            : (fullscreenPlayer.episode
            ? {
                id: fullscreenPlayer.episode.id,
                episodeId: fullscreenPlayer.episode.id,
                seriesId: fullscreenPlayer.series?.id || null,
                title: fullscreenPlayer.episode.title,
                seriesTitle: fullscreenPlayer.series?.title || null,
                description: fullscreenPlayer.episode.description || null,
                imageUrl:
                  fullscreenPlayer.episode.imageUrl ||
                  fullscreenPlayer.series?.imageUrl ||
                  null,
                playUrl:
                  fullscreenPlayer.streamUrl ||
                  fullscreenPlayer.episode.playUrl ||
                  null,
                channelLogo: null,
                channelName:
                  fullscreenPlayer.series?.provider ||
                  (fullscreenPlayer.series as any)?.providerId ||
                  null,
              }
            : null);
        vodProgressService.saveProgress(
          episodeId,
          seriesId,
          posMs,
          durMs,
          itemToSave
        );
      }
    }
    setFullscreenPlayer(null);
    setFocusNonce((n) => n + 1);
  }, [fullscreenPlayer]);

  const handleMediaChangeFromHome = useCallback(
    (streamUrl: string | null, channelId?: string | null) => {
      if (fullscreenPlayer) return;
      if (channelId !== undefined) {
        setActiveChannelId(channelId);
      }
      if (streamUrl !== activeStreamUrl) {
        setActiveStreamUrl(streamUrl);
        setIsVideoReady(false);
        vodCurrentTimeRef.current = 0;
        vodDurationRef.current = 0;
        setVodCurrentTime(0);
        setVodDuration(0);
      }
    },
    [fullscreenPlayer, activeStreamUrl]
  );

  const handleDestinationSelected = useCallback((dest: AppDestination) => {
    setCurrentDestination(dest);
    setIsRailExpanded(false);
    setFocusNonce(Date.now());
  }, []);

  if (isAppBootLoading) {
    return <AppSplashScreen />;
  }

  return (
    <TvNavContext.Provider
      value={{
        isRailExpanded,
        railWidth: isRailExpanded ? 176 : 56,
        isFullscreenPlayerActive: !!fullscreenPlayer,
      }}
    >
      <View style={styles.root}>
        <StatusBar hidden />

        {/* Persistent Root Video Player (Zero tearing down, continuous background to fullscreen) */}
        {activeStreamUrl && (
          <Video
            ref={globalVideoRef}
            source={{
              uri: activeStreamUrl,
              type: getStreamType(activeStreamUrl),
            }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            useTextureView={true}
            muted={isMuted}
            paused={isPaused}
            repeat={true}
            playInBackground={false}
            playWhenInactive={false}
            ignoreSilentSwitch="ignore"
            shutterColor="transparent"
            onLoad={(e) => {
              if (!activeChannelId) {
                const dur = e.duration > 0 ? e.duration : ((e as any).seekableDuration || 0);
                if (dur > 0) {
                  vodDurationRef.current = dur;
                  setVodDuration(dur);
                }
              }
              if (
                fullscreenPlayer &&
                !fullscreenPlayer.channel &&
                fullscreenPlayer.resumePositionMs &&
                fullscreenPlayer.resumePositionMs > 1000 &&
                !hasResumedSeekRef.current
              ) {
                hasResumedSeekRef.current = true;
                globalVideoRef.current?.seek(fullscreenPlayer.resumePositionMs / 1000);
              }
            }}
            onProgress={(e) => {
              if (!activeChannelId) {
                vodCurrentTimeRef.current = e.currentTime;
                setVodCurrentTime(e.currentTime);
                if (e.seekableDuration > 0 && e.seekableDuration > vodDurationRef.current) {
                  vodDurationRef.current = e.seekableDuration;
                  setVodDuration(e.seekableDuration);
                }
              }
              setIsBuffering(false);

              // Failsafe seek if onLoad / onReadyForDisplay didn't catch the seek target
              if (
                !hasResumedSeekRef.current &&
                fullscreenPlayer &&
                !fullscreenPlayer.channel &&
                fullscreenPlayer.resumePositionMs &&
                fullscreenPlayer.resumePositionMs > 2000 &&
                e.currentTime < 1.5
              ) {
                hasResumedSeekRef.current = true;
                globalVideoRef.current?.seek(fullscreenPlayer.resumePositionMs / 1000);
              }

              const now = Date.now();
              if (
                fullscreenPlayer &&
                !fullscreenPlayer.channel &&
                e.currentTime > 1 &&
                now - lastProgressSaveRef.current > 4000
              ) {
                lastProgressSaveRef.current = now;
                const episodeId =
                  fullscreenPlayer.episode?.id ||
                  fullscreenPlayer.recentItem?.episodeId ||
                  (fullscreenPlayer.recentItem as any)?.id;
                if (episodeId) {
                  const seriesId =
                    fullscreenPlayer.series?.id || fullscreenPlayer.recentItem?.seriesId;
                  const posMs = Math.floor(e.currentTime * 1000);
                  const durMs = Math.floor(vodDurationRef.current * 1000);
                  const itemToSave =
                    fullscreenPlayer.recentItem
                      ? {
                          ...fullscreenPlayer.recentItem,
                          playUrl: fullscreenPlayer.streamUrl || fullscreenPlayer.recentItem.playUrl,
                        }
                      : (fullscreenPlayer.episode
                      ? {
                          id: fullscreenPlayer.episode.id,
                          episodeId: fullscreenPlayer.episode.id,
                          seriesId: fullscreenPlayer.series?.id || null,
                          title: fullscreenPlayer.episode.title,
                          seriesTitle: fullscreenPlayer.series?.title || null,
                          description: fullscreenPlayer.episode.description || null,
                          imageUrl:
                            fullscreenPlayer.episode.imageUrl ||
                            fullscreenPlayer.series?.imageUrl ||
                            null,
                          playUrl:
                            fullscreenPlayer.streamUrl ||
                            fullscreenPlayer.episode.playUrl ||
                            null,
                          channelLogo: null,
                          channelName:
                            fullscreenPlayer.series?.provider ||
                            (fullscreenPlayer.series as any)?.providerId ||
                            null,
                        }
                      : null);
                  vodProgressService.saveProgress(
                    episodeId,
                    seriesId,
                    posMs,
                    durMs,
                    itemToSave
                  );
                }
              }
            }}
            onBuffer={(e) => {
              setIsBuffering(e.isBuffering);
            }}
            onReadyForDisplay={() => {
              setIsVideoReady(true);
              setIsBuffering(false);
              if (
                fullscreenPlayer &&
                !fullscreenPlayer.channel &&
                fullscreenPlayer.resumePositionMs &&
                fullscreenPlayer.resumePositionMs > 1000 &&
                (!hasResumedSeekRef.current || vodCurrentTimeRef.current < 2)
              ) {
                hasResumedSeekRef.current = true;
                globalVideoRef.current?.seek(fullscreenPlayer.resumePositionMs / 1000);
              }
            }}
            onError={(err) => {
              console.log('[Root Video Error]', err);
              setIsBuffering(false);
              setIsVideoReady(false);
            }}
          />
        )}

        {/* Main Content Area (Preserved in tree with display: none/flex for instant zero-delay transitions) */}
        <View
          style={[styles.contentContainer, !!fullscreenPlayer && styles.contentHidden]}
          pointerEvents={fullscreenPlayer ? 'none' : 'auto'}
        >
          {currentDestination === 'HOME' && (
            <HomeScreen
              initialChannels={channels}
              initialContinueWatching={continueWatchingItems}
              initialNewVod={newVodItems}
              onPlayChannel={handlePlayChannel}
              onPlayRecentVod={handlePlayRecentVod}
              onNavigateDestination={handleDestinationSelected}
              onRequestSideNavFocus={handleRequestSideNavFocus}
              recentChannelIds={recentChannelIds}
              activeStreamUrl={activeStreamUrl}
              isVideoReady={isVideoReady}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              onMediaChange={handleMediaChangeFromHome}
              focusNonce={focusNonce}
              activeChannelId={activeChannelId}
              isPlayerActive={!!fullscreenPlayer}
              isSideNavActive={isRailExpanded}
            />
          )}
          {currentDestination === 'LIVE_TV' && (
            <LiveTvScreen
              onPlayFullscreen={handlePlayChannel}
              focusNonce={focusNonce}
              onRequestSideNavFocus={handleRequestSideNavFocus}
              isSideNavActive={isRailExpanded}
              activeChannelId={activeChannelId}
            />
          )}
          {currentDestination === 'VOD' && (
            <VodScreen
              onPlayEpisode={handlePlayEpisode}
              focusNonce={focusNonce}
              onRequestSideNavFocus={handleRequestSideNavFocus}
              isSideNavActive={isRailExpanded}
            />
          )}
        </View>

        {/* Side Navigation Rail (Translucent over background player, 56dp collapsed / 176dp expanded) */}
        {!fullscreenPlayer && (
          <View style={styles.navRailWrapper} pointerEvents="box-none">
            <AppSideNavRail
              currentDestination={currentDestination}
              onDestinationSelected={handleDestinationSelected}
              onExpandedChanged={setIsRailExpanded}
              onReturnFocusToScreen={handleReturnFocusToScreen}
              focusDestination={sideNavFocusTarget?.destination}
              focusNonce={sideNavFocusTarget?.nonce}
            />
          </View>
        )}

        {/* Fullscreen Video Player: Live TV Player vs VOD Player */}
        {fullscreenPlayer?.channel ? (
          <LivePlayerOverlay
            channel={fullscreenPlayer.channel}
            program={fullscreenPlayer.program}
            channels={channels}
            hasExternalVideo={true}
            externalIsBuffering={isBuffering}
            isVideoReady={isVideoReady}
            onClose={handleClosePlayer}
            onSelectChannel={handleSelectChannelInPlayer}
            onSelectSourceUrl={handleSelectSourceUrl}
          />
        ) : fullscreenPlayer ? (
          <VodPlayerOverlay
            streamUrl={fullscreenPlayer.streamUrl}
            episode={fullscreenPlayer.episode}
            series={fullscreenPlayer.series}
            recentItem={fullscreenPlayer.recentItem}
            resumePositionMs={fullscreenPlayer.resumePositionMs}
            isResolving={fullscreenPlayer.isResolving}
            hasExternalVideo={true}
            externalIsPlaying={!isPaused}
            externalCurrentTime={vodCurrentTime}
            externalDuration={vodDuration}
            externalIsBuffering={isBuffering}
            onExternalTogglePlay={() => setIsPaused((p) => !p)}
            onExternalSeek={(deltaSeconds) => {
              const current = vodCurrentTimeRef.current;
              const maxDur = vodDurationRef.current > 0 ? vodDurationRef.current : 999999;
              const target = Math.max(0, Math.min(maxDur, current + deltaSeconds));
              vodCurrentTimeRef.current = target;
              setVodCurrentTime(target);
              globalVideoRef.current?.seek(target);
            }}
            onClose={handleClosePlayer}
            onSaveProgress={handleSaveProgress}
          />
        ) : null}
      </View>
    </TvNavContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080A0C',
  },
  contentContainer: {
    flex: 1,
  },
  contentHidden: {
    opacity: 0,
  },
  screenWrapper: {
    ...StyleSheet.absoluteFill,
  },
  screenHidden: {
    display: 'none',
  },
  navRailWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
});

