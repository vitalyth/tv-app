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
import { api } from './src/services/api';
import { vodProgressService } from './src/services/vodProgress';
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
  const [recentChannelIds, setRecentChannelIds] = useState<string[]>([]);
  const [isRailExpanded, setIsRailExpanded] = useState(false);

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

  useEffect(() => {
    api.getLiveChannels().then((res) => setChannels(res)).catch(() => {});
    vodProgressService.getRecentChannels().then((ids) => setRecentChannelIds(ids)).catch(() => {});
    vodProgressService.getMutePreference().then((saved) => {
      if (typeof saved === 'boolean') {
        setIsMuted(saved);
      }
    }).catch(() => {});
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
        if (channel.rawChannel) {
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
      if (channel.rawChannel) {
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
    const isDirect =
      !!item.playUrl &&
      (item.playUrl.includes('.m3u8') ||
        item.playUrl.includes('.mpd') ||
        item.playUrl.includes('.livx') ||
        item.playUrl.includes('.mp4'));

    let resumePositionMs = (item as any).positionMs;
    if (resumePositionMs === undefined && item.episodeId) {
      const saved = await vodProgressService.getProgress(item.episodeId);
      if (saved && !saved.isCompleted) {
        resumePositionMs = saved.positionMs;
      }
    }
    resumePositionMs = resumePositionMs || 0;

    let stream = isDirect ? item.playUrl : null;
    if (stream && activeStreamUrl !== stream) {
      setActiveStreamUrl(stream);
      setIsVideoReady(false);
    }
    setIsPaused(false);

    setFullscreenPlayer({
      streamUrl: stream,
      title: item.title,
      recentItem: item,
      resumePositionMs,
      isResolving: !isDirect,
    });

    if (!stream) {
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
      }
    }
  }, [activeStreamUrl]);

  const handlePlayEpisode = useCallback(async (episode: VodEpisode, series: VodSeries) => {
    const isDirect =
      !!episode.playUrl &&
      (episode.playUrl.includes('.m3u8') ||
        episode.playUrl.includes('.mpd') ||
        episode.playUrl.includes('.livx') ||
        episode.playUrl.includes('.mp4'));

    const savedProgress = await vodProgressService.getProgress(episode.id);
    const resumePositionMs = savedProgress?.positionMs || 0;

    let stream = isDirect ? episode.playUrl : null;
    if (stream && activeStreamUrl !== stream) {
      setActiveStreamUrl(stream);
      setIsVideoReady(false);
    }
    setIsPaused(false);

    setFullscreenPlayer({
      streamUrl: stream,
      title: episode.title,
      episode,
      series,
      resumePositionMs,
      isResolving: !isDirect,
    });

    if (!stream) {
      const resolved = await api.getVodEpisodeStream({
        episodeId: episode.id,
        seriesId: series.id,
        title: episode.title,
        seriesTitle: series.title,
        imageUrl: episode.imageUrl,
        playUrl: episode.playUrl,
        channelName: series.provider,
        rawItem: { ...episode, provider: series.provider },
      });
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
      }
    }
  }, [activeStreamUrl]);

  const handleClosePlayer = useCallback(() => {
    setFullscreenPlayer(null);
    setFocusNonce((n) => n + 1);
  }, []);

  const handleMediaChangeFromHome = useCallback(
    (streamUrl: string | null, channelId?: string | null) => {
      if (channelId !== undefined) {
        setActiveChannelId(channelId);
      }
      if (streamUrl !== activeStreamUrl) {
        setActiveStreamUrl(streamUrl);
        setIsVideoReady(false);
      }
    },
    [activeStreamUrl]
  );

  const handleDestinationSelected = useCallback((dest: AppDestination) => {
    setCurrentDestination(dest);
    setIsRailExpanded(false);
  }, []);

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
              setVodDuration(e.duration);
            }}
            onProgress={(e) => {
              setVodCurrentTime(e.currentTime);
              setIsBuffering(false);
            }}
            onBuffer={(e) => {
              setIsBuffering(e.isBuffering);
            }}
            onReadyForDisplay={() => {
              setIsVideoReady(true);
              setIsBuffering(false);
            }}
            onError={(err) => {
              console.log('[Root Video Error]', err);
              setIsBuffering(false);
              setIsVideoReady(false);
            }}
          />
        )}

        {/* Main Content Area (Hidden via opacity: 0 when fullscreen to preserve tree & focus) */}
        <View
          style={[styles.contentContainer, !!fullscreenPlayer && styles.contentHidden]}
          pointerEvents={fullscreenPlayer ? 'none' : 'auto'}
        >
          {currentDestination === 'HOME' && (
            <HomeScreen
              onPlayChannel={handlePlayChannel}
              onPlayRecentVod={handlePlayRecentVod}
              onNavigateDestination={handleDestinationSelected}
              recentChannelIds={recentChannelIds}
              activeStreamUrl={activeStreamUrl}
              isVideoReady={isVideoReady}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              onMediaChange={handleMediaChangeFromHome}
              focusNonce={focusNonce}
              activeChannelId={activeChannelId}
            />
          )}
          {currentDestination === 'LIVE_TV' && (
            <LiveTvScreen onPlayFullscreen={handlePlayChannel} />
          )}
          {currentDestination === 'VOD' && (
            <VodScreen onPlayEpisode={handlePlayEpisode} />
          )}
        </View>

        {/* Side Navigation Rail (Translucent over background player, 56dp collapsed / 176dp expanded) */}
        {!fullscreenPlayer && (
          <View style={styles.navRailWrapper} pointerEvents="box-none">
            <AppSideNavRail
              currentDestination={currentDestination}
              onDestinationSelected={handleDestinationSelected}
              onExpandedChanged={setIsRailExpanded}
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
            onExternalSeek={(secs) => {
              globalVideoRef.current?.seek(secs);
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
  navRailWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
});

