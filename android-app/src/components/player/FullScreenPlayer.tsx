import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  useTVEventHandler,
} from 'react-native';
import {
  useMediaActions,
  useMediaController,
} from '../../media/MediaController';
import { resolveLiveChannelStream } from '../../api/channels';
import { resolveVodStream } from '../../api/vod';
import { PlayerTopInfo } from './PlayerTopInfo';
import {
  PlayerBottomControls,
  type ControlId,
} from './PlayerBottomControls';
import { QualityDialog } from './QualityDialog';
import { PlayerPlaceholderDialog } from './PlayerPlaceholderDialog';
import { WatchProgressService } from '../../services/watchProgress';

interface FullScreenPlayerProps {
  onExit: () => void;
}

type DialogType = 'quality' | 'sources' | 'multiview' | null;

const CONTROLS_HIDE_DELAY_MS = 4500;
const VOD_PROGRESS_SAVE_INTERVAL_MS = 5000;

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

export const FullScreenPlayer = memo(function FullScreenPlayerView({
  onExit,
}: FullScreenPlayerProps) {
  const {
    item,
    stream,
    paused,
    currentTime,
    duration,
    videoQualities,
    selectedQualityId,
    togglePlayPause,
    setSelectedQuality,
  } = useMediaController();
  const { playFullscreen, markError } = useMediaActions();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [lastFocusedControl, setLastFocusedControl] = useState<ControlId>('play-pause');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  const controlsRevealedAtRef = useRef<number>(Date.now());

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
    controlsRevealedAtRef.current = Date.now();
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleTogglePlayPause = useCallback(() => {
    // Prevent accidental play/pause toggle if controls were just revealed in the last 500ms
    if (Date.now() - controlsRevealedAtRef.current < 500) {
      return;
    }
    togglePlayPause();
  }, [togglePlayPause]);

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
    if (event.eventKeyAction === 1 || event.eventType === 'back') {
      return;
    }

    // Any remote input resets the hide timer
    resetHideTimer();

    // If controls are hidden, any key press reveals them without executing action
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
        if (activeDialog !== null) {
          setActiveDialog(null);
          setControlsVisible(true);
          resetHideTimer();
          return true;
        }

        if (controlsVisible) {
          clearHideTimer();
          setControlsVisible(false);
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
    clearHideTimer,
    controlsVisible,
    currentTime,
    duration,
    item,
    onExit,
    resetHideTimer,
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
    clearHideTimer();
    setLastFocusedControl('quality');
    setActiveDialog('quality');
  }, [clearHideTimer]);

  const handleOpenSources = useCallback(() => {
    clearHideTimer();
    setLastFocusedControl('sources');
    setActiveDialog('sources');
  }, [clearHideTimer]);

  const handleOpenMultiView = useCallback(() => {
    clearHideTimer();
    setLastFocusedControl('multiview');
    setActiveDialog('multiview');
  }, [clearHideTimer]);

  const handleCloseDialog = useCallback(() => {
    setActiveDialog(null);
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  if (!item) {
    return null;
  }

  return (
    <View style={styles.root} testID="fullscreen-player">
      {/* Invisible full-screen activator when controls are hidden */}
      {!controlsVisible && !activeDialog ? (
        <Pressable
          hasTVPreferredFocus={true}
          style={StyleSheet.absoluteFill}
          onPress={handleRevealControls}
        />
      ) : null}

      {/* Player Overlays (Top and Bottom) - hidden when a dialog is active */}
      {controlsVisible && !activeDialog ? (
        <View
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <PlayerTopInfo item={item} />
          <View style={styles.spacer} pointerEvents="none" />
          <PlayerBottomControls
            item={item}
            paused={paused}
            currentTime={currentTime}
            duration={duration}
            selectedQualityId={selectedQualityId}
            videoQualities={videoQualities}
            lastFocusedControl={lastFocusedControl}
            onFocusControl={setLastFocusedControl}
            onTogglePlayPause={handleTogglePlayPause}
            onOpenQuality={handleOpenQuality}
            onOpenSources={handleOpenSources}
            onOpenMultiView={handleOpenMultiView}
          />
        </View>
      ) : null}

      {/* Modal Dialogs - Centered on screen */}
      {activeDialog === 'quality' ? (
        <QualityDialog
          qualities={videoQualities}
          selectedQualityId={selectedQualityId}
          onSelectQuality={setSelectedQuality}
          onClose={handleCloseDialog}
        />
      ) : null}

      {activeDialog === 'sources' ? (
        <PlayerPlaceholderDialog
          title="מקורות נוספים"
          message="אין מקורות חלופיים זמינים כעת עבור ערוץ זה. תכונה זו תורחב בשלבים הבאים."
          onClose={handleCloseDialog}
        />
      ) : null}

      {activeDialog === 'multiview' ? (
        <PlayerPlaceholderDialog
          title="צפייה מפוצלת"
          message="צפייה מפוצלת במספר ערוצים במקביל (Multi View) תהיה זמינה בשלב הבא."
          onClose={handleCloseDialog}
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
});
