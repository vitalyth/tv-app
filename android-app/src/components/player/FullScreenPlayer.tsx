import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useTVEventHandler,
} from 'react-native';
import {
  useMediaActions,
  useMediaController,
} from '../../media/MediaController';
import {
  getLiveChannelSourceOptions,
  getPlayableLiveChannels,
  resolveLiveChannelStream,
  selectLiveChannelSource,
} from '../../api/channels';
import { resolveVodStream } from '../../api/vod';
import { PlayerTopInfo } from './PlayerTopInfo';
import {
  PlayerBottomControls,
  type ControlId,
} from './PlayerBottomControls';
import { QualityDialog } from './QualityDialog';
import { SourceDialog } from './SourceDialog';
import { LiveChannelDrawer } from './LiveChannelDrawer';
import { WatchProgressService } from '../../services/watchProgress';
import { LiveSourcePreferencesService } from '../../services/liveSourcePreferences';
import { t } from '../../i18n';
import { tvPlatform } from '../../platform/runtime';
import { isSameMediaItem, type MediaItem } from '../../media/player';
import { RecentChannelsService } from '../../services/recentChannels';

interface FullScreenPlayerProps {
  onExit: () => void;
}

type DialogType = 'quality' | 'sources' | 'channels' | null;

const CONTROLS_HIDE_DELAY_MS = 4500;
const VOD_PROGRESS_SAVE_INTERVAL_MS = 5000;
const PLAYER_REMOTE_EVENTS = new Set([
  'up', 'down', 'left', 'right',
  'longUp', 'longDown', 'longLeft', 'longRight',
  'select', 'longSelect', 'enter',
  'playPause', 'playpause', 'play', 'pause', 'stop',
  'rewind', 'fastForward', 'skip_backward', 'skip_forward', 'info',
]);

/**
 * Extracts a stable, canonical episodeId from a MediaItem for watch progress storage.
 * Strips "vod-" and "cw-" prefixes that are added during MediaItem construction,
 * and prefers the raw episodeId from sourcePayload when available.
 */
function getEpisodeId(item: { id: string; kind: string; sourcePayload?: unknown } | null | undefined): string | null {
  if (!item || item.kind !== 'vod') {
    return null;
  }
  // Prefer the raw episodeId stored in sourcePayload (from the original API item)
  const payload = item.sourcePayload as Record<string, unknown> | null | undefined;
  const payloadEpisodeId =
    typeof payload?.episodeId === 'string' && payload.episodeId
      ? payload.episodeId
      : undefined;
  if (payloadEpisodeId) {
    return payloadEpisodeId;
  }
  // Fall back to item.id, stripping known prefixes ("cw-", "vod-")
  return item.id.replace(/^(cw-)+/, '').replace(/^vod-/, '');
}

function PlayerLoadingIndicator() {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  return (
    <Animated.View style={[styles.spinner, {
      transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
    }]} />
  );
}

export const FullScreenPlayer = memo(function FullScreenPlayerView({
  onExit,
}: FullScreenPlayerProps) {
  const {
    item,
    stream,
    paused,
    status,
    currentTime,
    duration,
    seekableStart,
    seekableEnd,
    videoQualities,
    selectedQualityId,
    togglePlayPause,
    setPaused,
    setSelectedQuality,
    seekTo,
  } = useMediaController();
  const { playFullscreen, markError, enterMultiView } = useMediaActions();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [channelInfoItem, setChannelInfoItem] = useState<MediaItem | null>(null);
  const [resolvingChannel, setResolvingChannel] = useState(false);
  const [channelListError, setChannelListError] = useState<string>();
  const channelInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [lastFocusedControl, setLastFocusedControl] = useState<ControlId>('play-pause');
  const [switchingSourceId, setSwitchingSourceId] = useState<string>();
  const [sourceError, setSourceError] = useState<string>();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceSwitchRequestRef = useRef(0);
  const lastSavedPositionRef = useRef<number>(0);
  const controlsRevealedAtRef = useRef<number>(0);
  const liveRecoveryRef = useRef({ id: '', attempts: 0 });
  const liveChannelsRef = useRef<Promise<MediaItem[]> | null>(null);
  const channelSwitchRequestRef = useRef(0);
  const channelTargetRef = useRef(item);
  const currentItemRef = useRef(item);
  currentItemRef.current = item;

  useEffect(() => {
    channelTargetRef.current = item;
    channelSwitchRequestRef.current += 1;
    setResolvingChannel(false);
  }, [item]);

  useEffect(() => () => {
    channelSwitchRequestRef.current += 1;
    if (channelInfoTimerRef.current) {
      clearTimeout(channelInfoTimerRef.current);
    }
  }, []);

  const showChannelInfo = useCallback((nextItem: MediaItem | null, autoHide = false) => {
    if (channelInfoTimerRef.current) {
      clearTimeout(channelInfoTimerRef.current);
      channelInfoTimerRef.current = null;
    }
    setChannelInfoItem(nextItem);
    if (nextItem && autoHide) {
      channelInfoTimerRef.current = setTimeout(() => {
        channelInfoTimerRef.current = null;
        setChannelInfoItem(null);
      }, CONTROLS_HIDE_DELAY_MS);
    }
  }, []);

  const loadLiveChannels = useCallback(() => {
    if (!liveChannelsRef.current) {
      liveChannelsRef.current = getPlayableLiveChannels().catch(error => {
        liveChannelsRef.current = null;
        throw error;
      });
    }
    return liveChannelsRef.current;
  }, []);

  const switchChannel = useCallback(async (selection: number | MediaItem) => {
    const request = ++channelSwitchRequestRef.current;
    const origin = currentItemRef.current;
    const fromList = typeof selection !== 'number';
    try {
      const channels = await loadLiveChannels();
      if (!isSameMediaItem(origin, currentItemRef.current)) {
        return;
      }
      if (fromList && request !== channelSwitchRequestRef.current) {
        return;
      }
      const current = channelTargetRef.current ?? currentItemRef.current;
      const index = channels.findIndex(channel => isSameMediaItem(channel, current));
      if (!fromList && (index < 0 || channels.length < 2)) {
        return;
      }
      const target = typeof selection === 'number'
        ? channels[(index + selection + channels.length) % channels.length]
        : channels.find(channel => isSameMediaItem(channel, selection));
      if (!target) {
        return;
      }
      // Count every press, but only resolve and play the most recent selection.
      channelTargetRef.current = target;
      if (request !== channelSwitchRequestRef.current) {
        return;
      }
      setChannelListError(undefined);
      if (fromList && isSameMediaItem(target, currentItemRef.current)) {
        setResolvingChannel(false);
        setActiveDialog(null);
        showChannelInfo(null);
        return;
      }
      showChannelInfo(target);
      setResolvingChannel(true);
      const nextStream = await resolveLiveChannelStream(target);
      if (request !== channelSwitchRequestRef.current) {
        return;
      }
      setResolvingChannel(false);
      playFullscreen(target, nextStream);
      if (fromList) {
        setActiveDialog(null);
        setControlsVisible(false);
      }
      showChannelInfo(target, true);
      RecentChannelsService.recordChannelWatched(target.id).catch(() => {});
    } catch {
      if (request === channelSwitchRequestRef.current) {
        setResolvingChannel(false);
        channelTargetRef.current = currentItemRef.current;
        if (fromList) {
          setChannelListError(t('playerChannelUnavailable'));
        }
        showChannelInfo(currentItemRef.current ?? null, true);
      }
    }
  }, [loadLiveChannels, playFullscreen, showChannelInfo]);

  useEffect(() => {
    if (liveRecoveryRef.current.id !== item?.id) {
      liveRecoveryRef.current = { id: item?.id ?? '', attempts: 0 };
    }
    if (status !== 'error' || item?.kind !== 'live' || liveRecoveryRef.current.attempts >= 2) {
      return;
    }
    let cancelled = false;
    liveRecoveryRef.current.attempts += 1;
    resolveLiveChannelStream(item, { useSavedSource: false }).then(nextStream => {
      if (!cancelled && nextStream.url !== stream?.url) {
        playFullscreen(item, nextStream);
      }
    }).catch(() => {
      // Keep the existing source controls available if renewal also fails.
    });
    return () => { cancelled = true; };
  }, [item, playFullscreen, status, stream?.url]);

  // 1. Controls Auto-Hide Management
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const resetHideTimer = useCallback(() => {
    clearHideTimer();
    if (!activeDialog) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY_MS);
    }
  }, [activeDialog, clearHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => clearHideTimer();
  }, [activeDialog, resetHideTimer, clearHideTimer]);

  const handleRevealControls = useCallback(() => {
    showChannelInfo(null);
    controlsRevealedAtRef.current = Date.now();
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer, showChannelInfo]);

  const closeChannelDrawer = useCallback(() => {
    channelSwitchRequestRef.current += 1;
    channelTargetRef.current = currentItemRef.current;
    setResolvingChannel(false);
    setChannelListError(undefined);
    showChannelInfo(null);
    clearHideTimer();
    setControlsVisible(false);
    setActiveDialog(null);
  }, [clearHideTimer, showChannelInfo]);

  const handleTogglePlayPause = useCallback(() => {
    // Prevent accidental play/pause toggle if controls were just revealed in the last 500ms
    if (Date.now() - controlsRevealedAtRef.current < 500) {
      return;
    }
    togglePlayPause();
  }, [togglePlayPause]);

  const wasJustRevealed = useCallback(
    () => Date.now() - controlsRevealedAtRef.current < 500,
    [],
  );

  // 2. Asynchronous Stream Resolution in Full Screen
  useEffect(() => {
    if (!item || stream) {
      return;
    }

    let active = true;
    const resolver =
      item.kind === 'vod' ? resolveVodStream : resolveLiveChannelStream;

    resolver(item)
      .then(resolvedStream => {
        if (active) {
          playFullscreen(item, resolvedStream);
        }
      })
      .catch(() => {
        if (active) {
          markError();
        }
      });

    return () => {
      active = false;
    };
  }, [item, markError, playFullscreen, stream]);

  // 3. TV Remote Event Handling
  useTVEventHandler(event => {
    if (
      event.eventKeyAction === 1 ||
      !PLAYER_REMOTE_EVENTS.has(event.eventType)
    ) {
      return;
    }

    if (
      !controlsVisible && !activeDialog && item?.kind === 'live' &&
      event.eventType === 'left'
    ) {
      channelSwitchRequestRef.current += 1;
      channelTargetRef.current = currentItemRef.current;
      setResolvingChannel(false);
      setChannelListError(undefined);
      showChannelInfo(null);
      clearHideTimer();
      setActiveDialog('channels');
      return;
    }

    if (
      !controlsVisible && !activeDialog && item?.kind === 'live' &&
      (event.eventType === 'up' || event.eventType === 'down')
    ) {
      switchChannel(event.eventType === 'up' ? 1 : -1);
      return;
    }

    // Vega's media session handles these keys; its media events report the result.
    if (tvPlatform.id !== 'kepler') {
      if (event.eventType === 'playpause' || event.eventType === 'playPause') {
        togglePlayPause();
      } else if (event.eventType === 'play' || event.eventType === 'pause') {
        setPaused(event.eventType === 'pause');
      }
    }

    if (activeDialog === 'channels') {
      if (event.eventType === 'right') {
        closeChannelDrawer();
      }
      return;
    }

    // Only player input affects the controls' visibility timer.
    resetHideTimer();

    // Navigation reveals controls; dedicated media keys also act immediately.
    if (!controlsVisible && !activeDialog) {
      handleRevealControls();
    }
  });

  // 3. Back Key Priority Hierarchy
  // Priority: 1. Dialog open? -> Close Dialog and re-show controls
  //           2. Controls visible? -> Hide Controls
  //           3. Otherwise -> Exit Full Screen
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (activeDialog === 'channels') {
          closeChannelDrawer();
          return true;
        }
        if (activeDialog !== null) {
          setActiveDialog(null);
          setControlsVisible(true);
          resetHideTimer();
          return true;
        }

        if (controlsVisible || channelInfoItem) {
          clearHideTimer();
          setControlsVisible(false);
          showChannelInfo(null);
          return true;
        }

        // Save VOD progress on exit
        if (item?.kind === 'vod' && currentTime > 0) {
          const episodeId = getEpisodeId(item);
          if (episodeId) {
            WatchProgressService.saveProgress({
              episodeId,
              title: item.title,
              imageUrl: item.imageUrl,
              backdropUrl: item.backdropUrl,
              positionMs: Math.round(currentTime * 1000),
              durationMs: Math.round(duration * 1000),
              sourcePayload: item.sourcePayload,
            }).catch(() => {});
          }
        }

        onExit();
        return true;
      },
    );

    return () => subscription.remove();
  }, [
    activeDialog,
    channelInfoItem,
    closeChannelDrawer,
    clearHideTimer,
    controlsVisible,
    currentTime,
    duration,
    item,
    onExit,
    resetHideTimer,
    showChannelInfo,
  ]);

  // 4. VOD Watch Progress Periodic Persistence
  useEffect(() => {
    if (!item || item.kind !== 'vod' || currentTime <= 0) {
      return;
    }

    const diff = Math.abs(currentTime - lastSavedPositionRef.current);
    if (diff >= 5) {
      lastSavedPositionRef.current = currentTime;
      const episodeId = getEpisodeId(item);
      if (episodeId) {
        WatchProgressService.saveProgress({
          episodeId,
          title: item.title,
          imageUrl: item.imageUrl,
          backdropUrl: item.backdropUrl,
          positionMs: Math.round(currentTime * 1000),
          durationMs: Math.round(duration * 1000),
          sourcePayload: item.sourcePayload,
        }).catch(() => {});
      }
    }
  }, [currentTime, duration, item]);

  // 5. Periodic timer fallback for saving VOD progress
  useEffect(() => {
    if (!item || item.kind !== 'vod') {
      return;
    }

    const interval = setInterval(() => {
      if (currentTime > 0) {
        const episodeId = getEpisodeId(item);
        if (episodeId) {
          WatchProgressService.saveProgress({
            episodeId,
            title: item.title,
            imageUrl: item.imageUrl,
            backdropUrl: item.backdropUrl,
            positionMs: Math.round(currentTime * 1000),
            durationMs: Math.round(duration * 1000),
            sourcePayload: item.sourcePayload,
          }).catch(() => {});
        }
      }
    }, VOD_PROGRESS_SAVE_INTERVAL_MS);

    (interval as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(interval);
  }, [currentTime, duration, item]);

  const handleOpenQuality = useCallback(() => {
    if (wasJustRevealed()) {
      return;
    }
    clearHideTimer();
    setLastFocusedControl('quality');
    setActiveDialog('quality');
  }, [clearHideTimer, wasJustRevealed]);

  const handleOpenSources = useCallback(() => {
    if (wasJustRevealed()) {
      return;
    }
    clearHideTimer();
    setLastFocusedControl('sources');
    setSourceError(undefined);
    setActiveDialog('sources');
  }, [clearHideTimer, wasJustRevealed]);

  const handleOpenMultiView = useCallback(() => {
    if (wasJustRevealed()) {
      return;
    }
    clearHideTimer();
    setLastFocusedControl('multiview');
    enterMultiView();
  }, [clearHideTimer, wasJustRevealed, enterMultiView]);

  const handleCloseDialog = useCallback(() => {
    if (activeDialog === 'sources') {
      sourceSwitchRequestRef.current += 1;
      setSwitchingSourceId(undefined);
      setSourceError(undefined);
    }
    setActiveDialog(null);
    setControlsVisible(true);
    resetHideTimer();
  }, [activeDialog, resetHideTimer]);

  const sourceOptions = useMemo(
    () =>
      item?.kind === 'live'
        ? getLiveChannelSourceOptions(item, stream?.sourceId)
        : [],
    [item, stream?.sourceId],
  );

  const handleSelectSource = useCallback(
    async (sourceId: string) => {
      if (!item || item.kind !== 'live') {
        return;
      }
      const selectedItem = selectLiveChannelSource(item, sourceId);
      if (!selectedItem) {
        setSourceError(t('playerSourceUnavailable'));
        return;
      }
      const selectedOption = sourceOptions.find(
        option => option.id === sourceId,
      );
      if (selectedOption?.selected) {
        handleCloseDialog();
        return;
      }

      const requestId = sourceSwitchRequestRef.current + 1;
      sourceSwitchRequestRef.current = requestId;
      setSwitchingSourceId(sourceId);
      setSourceError(undefined);
      try {
        const resolvedStream = await resolveLiveChannelStream(selectedItem, {
          useSavedSource: false,
        });
        if (sourceSwitchRequestRef.current !== requestId) {
          return;
        }
        await LiveSourcePreferencesService.setSourceId(item.id, sourceId);
        if (sourceSwitchRequestRef.current !== requestId) {
          return;
        }
        playFullscreen(selectedItem, resolvedStream);
        setSwitchingSourceId(undefined);
        setActiveDialog(null);
        setControlsVisible(true);
        resetHideTimer();
      } catch {
        if (sourceSwitchRequestRef.current === requestId) {
          setSwitchingSourceId(undefined);
          setSourceError('לא ניתן להתחבר למקור. אפשר לבחור מקור אחר.');
        }
      }
    },
    [handleCloseDialog, item, playFullscreen, resetHideTimer, sourceOptions],
  );

  if (!item) {
    return null;
  }

  return (
    <View style={styles.root} testID="fullscreen-player">
      {/* Invisible full-screen activator when controls are hidden */}
      {!controlsVisible && !activeDialog ? (
        <Pressable
          testID="fullscreen-controls-activator"
          hasTVPreferredFocus={true}
          style={StyleSheet.absoluteFill}
          onPress={handleRevealControls}
        />
      ) : null}

      {resolvingChannel || status === 'loading' ? (
        <View testID="player-loading" pointerEvents="none" style={styles.loading}>
          <PlayerLoadingIndicator />
        </View>
      ) : null}

      {/* Player Overlays (Top and Bottom) - hidden when a dialog is active */}
      {(controlsVisible || channelInfoItem) && !activeDialog ? (
        <View
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <View testID="player-top-panel" pointerEvents="none">
            <PlayerTopInfo item={controlsVisible ? item : channelInfoItem ?? item} />
          </View>
          {controlsVisible ? <>
            <View style={styles.spacer} pointerEvents="none" />
            <PlayerBottomControls
            item={item}
            paused={paused}
            currentTime={currentTime}
            duration={duration}
            seekableStart={seekableStart}
            seekableEnd={seekableEnd}
            selectedQualityId={selectedQualityId}
            videoQualities={videoQualities}
            hasAlternateSources={sourceOptions.length > 1}
            lastFocusedControl={lastFocusedControl}
            onFocusControl={setLastFocusedControl}
            onTogglePlayPause={handleTogglePlayPause}
            onSeek={seekTo}
            onOpenQuality={handleOpenQuality}
            onOpenSources={handleOpenSources}
            onOpenMultiView={handleOpenMultiView}
            />
          </> : null}
        </View>
      ) : null}

      {/* Modal Dialogs - Centered on screen */}
      {activeDialog === 'channels' && item.kind === 'live' ? (
        <LiveChannelDrawer
          item={item}
          loadChannels={loadLiveChannels}
          switchingChannelId={resolvingChannel ? channelTargetRef.current?.id : undefined}
          error={channelListError}
          onSelectChannel={switchChannel}
          onClose={closeChannelDrawer}
        />
      ) : null}

      {activeDialog === 'quality' ? (
        <QualityDialog
          qualities={videoQualities}
          selectedQualityId={selectedQualityId}
          onSelectQuality={setSelectedQuality}
          onClose={handleCloseDialog}
        />
      ) : null}

      {activeDialog === 'sources' ? (
        <SourceDialog
          sources={sourceOptions}
          channelLabel={
            [item.channelNumber, item.channelName].filter(Boolean).join('  ')
          }
          switchingSourceId={switchingSourceId}
          error={sourceError}
          onSelectSource={handleSelectSource}
        />
      ) : null}

    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 100,
    elevation: 100,
  },
  spacer: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.25)',
    borderTopColor: '#38bdf8',
  },
});
