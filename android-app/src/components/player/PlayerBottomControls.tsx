import { memo, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  useTVEventHandler,
  View,
} from 'react-native';
import type { MediaItem, VideoQualityOption } from '../../media/player';
import { t } from '../../i18n';

const playIcon = require('../../assets/icons/play.png');
const pauseIcon = require('../../assets/icons/pause.png');
const settingsIcon = require('../../assets/icons/settings.png');
const sourcesIcon = require('../../assets/icons/sources.png');
const multiviewIcon = require('../../assets/icons/multiview.png');

export type ControlId =
  | 'timeline'
  | 'play-pause'
  | 'sources'
  | 'multiview'
  | 'quality';

interface PlayerBottomControlsProps {
  item: MediaItem;
  paused: boolean;
  currentTime: number;
  duration: number;
  selectedQualityId: string;
  videoQualities: VideoQualityOption[];
  hasAlternateSources: boolean;
  lastFocusedControl: ControlId;
  onFocusControl: (id: ControlId) => void;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onOpenQuality: () => void;
  onOpenSources: () => void;
  onOpenMultiView: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
      2,
      '0',
    )}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const PlayerBottomControls = memo(function PlayerBottomControlsView({
  item,
  paused,
  currentTime,
  duration,
  selectedQualityId,
  videoQualities,
  hasAlternateSources,
  lastFocusedControl,
  onFocusControl,
  onTogglePlayPause,
  onSeek,
  onOpenQuality,
  onOpenSources,
  onOpenMultiView,
}: PlayerBottomControlsProps) {
  const isLive = item.kind === 'live';
  const showSources = isLive && hasAlternateSources;
  const canSeek = !isLive && Number.isFinite(duration) && duration > 0;
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const seekPositionRef = useRef<number | null>(null);
  const focusedControlRef = useRef<ControlId | null>(null);
  const previousRowControlRef = useRef<ControlId>('play-pause');
  const displayedTime = seekPosition ?? currentTime;

  // Keep repeated remote presses cumulative until playback acknowledges the seek.
  useEffect(() => {
    if (seekPosition !== null && Math.abs(currentTime - seekPosition) < 2) {
      seekPositionRef.current = null;
      setSeekPosition(null);
    }
  }, [currentTime, seekPosition]);

  useEffect(() => {
    if (seekPosition === null) {
      return;
    }
    const timeout = setTimeout(() => {
      seekPositionRef.current = null;
      setSeekPosition(null);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [seekPosition]);

  const seekBy = (offset: number) => {
    if (!canSeek) {
      return;
    }
    const position = Math.min(
      duration,
      Math.max(0, (seekPositionRef.current ?? currentTime) + offset),
    );
    seekPositionRef.current = position;
    setSeekPosition(position);
    onSeek(position);
  };

  // Calculate timeline percentage
  let progressPct = 0;
  if (isLive) {
    progressPct =
      typeof item.progressPercentage === 'number'
        ? Math.min(100, Math.max(0, item.progressPercentage))
        : 100;
  } else if (duration > 0) {
    progressPct = Math.min(100, Math.max(0, (displayedTime / duration) * 100));
  }

  // Derive resolution badge (SD / HD / FHD)
  let resolutionBadge = 'SD';
  const numericId = parseInt(selectedQualityId, 10);
  if (selectedQualityId === '1080' || numericId >= 1080) {
    resolutionBadge = 'HD';
  } else if (selectedQualityId === '720' || numericId >= 720) {
    resolutionBadge = 'HD';
  } else if (selectedQualityId === 'auto') {
    // Check if HD options exist in available qualities
    const hasHd = videoQualities.some(q => {
      const h = parseInt(q.id, 10);
      return h >= 720;
    });
    resolutionBadge = hasHd ? 'HD' : 'SD';
  } else {
    resolutionBadge = 'SD';
  }

  const playRef = useRef<View>(null);
  const sourcesRef = useRef<View>(null);
  const multiviewRef = useRef<View>(null);
  const qualityRef = useRef<View>(null);
  const timelineRef = useRef<View>(null);

  const handleFocus = (id: ControlId) => {
    focusedControlRef.current = id;
    if (id !== 'timeline') {
      previousRowControlRef.current = id;
    }
    onFocusControl(id);
  };

  // Focus restoration when lastFocusedControl changes
  useEffect(() => {
    const targetRef =
      lastFocusedControl === 'timeline'
        ? timelineRef
        : lastFocusedControl === 'quality'
        ? qualityRef
        : lastFocusedControl === 'sources' && showSources
        ? sourcesRef
        : lastFocusedControl === 'multiview'
        ? multiviewRef
        : playRef;
    const timer = setTimeout(() => {
      targetRef.current?.requestTVFocus?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [lastFocusedControl, showSources]);

  // Handle remote DPAD left/right explicitly to bridge the flexSpacer gap seamlessly
  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }

    const focusedControl = focusedControlRef.current;
    if (!focusedControl) {
      return;
    }
    if (event.eventType === 'up' && focusedControl !== 'timeline') {
      timelineRef.current?.requestTVFocus?.();
      return;
    }
    if (focusedControl === 'timeline') {
      if (event.eventType === 'down') {
        const previous = previousRowControlRef.current;
        const target =
          previous === 'quality'
            ? qualityRef
            : previous === 'sources' && showSources
            ? sourcesRef
            : previous === 'multiview' && isLive
            ? multiviewRef
            : playRef;
        target.current?.requestTVFocus?.();
      } else if (
        canSeek &&
        (event.eventType === 'left' || event.eventType === 'right')
      ) {
        seekBy(event.eventType === 'right' ? 10 : -10);
      }
      return;
    }

    if (event.eventType === 'right') {
      if (lastFocusedControl === 'play-pause') {
        const next = showSources ? 'sources' : isLive ? 'multiview' : 'quality';
        onFocusControl(next);
        const target =
          next === 'sources'
            ? sourcesRef
            : next === 'multiview'
            ? multiviewRef
            : qualityRef;
        target.current?.requestTVFocus?.();
      } else if (lastFocusedControl === 'sources') {
        onFocusControl('multiview');
        multiviewRef.current?.requestTVFocus?.();
      } else if (lastFocusedControl === 'multiview') {
        onFocusControl('quality');
        qualityRef.current?.requestTVFocus?.();
      }
    } else if (event.eventType === 'left') {
      if (lastFocusedControl === 'quality') {
        const prev = isLive ? 'multiview' : 'play-pause';
        onFocusControl(prev);
        const target = prev === 'multiview' ? multiviewRef : playRef;
        target.current?.requestTVFocus?.();
      } else if (lastFocusedControl === 'multiview') {
        const previous = showSources ? 'sources' : 'play-pause';
        onFocusControl(previous);
        const target = showSources ? sourcesRef : playRef;
        target.current?.requestTVFocus?.();
      } else if (lastFocusedControl === 'sources') {
        onFocusControl('play-pause');
        playRef.current?.requestTVFocus?.();
      }
    }
  });

  return (
    <TVFocusGuideView trapFocusUp trapFocusDown style={styles.container}>
      {/* 1. Timeline Progress Bar */}
      <TVFocusGuideView trapFocusLeft trapFocusRight>
        <Pressable
          ref={timelineRef}
          testID="player-timeline"
          focusable
          hasTVPreferredFocus={lastFocusedControl === 'timeline'}
          accessibilityRole={canSeek ? 'adjustable' : 'progressbar'}
          accessibilityLabel="Playback position"
          accessibilityValue={
            canSeek ? { min: 0, max: duration, now: displayedTime } : undefined
          }
          accessibilityActions={
            canSeek ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
          }
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') {
              seekBy(10);
            } else if (nativeEvent.actionName === 'decrement') {
              seekBy(-10);
            }
          }}
          onFocus={() => handleFocus('timeline')}
          onBlur={() => {
            focusedControlRef.current = null;
          }}
          style={({ focused }) => [
            styles.timelineContainer,
            focused && styles.timelineFocused,
          ]}
        >
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            <View style={[styles.progressThumb, { left: `${progressPct}%` }]} />
          </View>
        </Pressable>
      </TVFocusGuideView>

      {/* 2. Bottom Controls Row */}
      <TVFocusGuideView
        trapFocusDown
        destinations={
          [
            playRef.current,
            sourcesRef.current,
            multiviewRef.current,
            qualityRef.current,
          ].filter(Boolean) as any
        }
        style={styles.controlsRow}
      >
        {/* Play / Pause Button */}
        <Pressable
          ref={playRef}
          testID="play-pause-button"
          focusable={true}
          hasTVPreferredFocus={lastFocusedControl === 'play-pause'}
          nextFocusRight={
            showSources
              ? (sourcesRef.current as any)
              : isLive
              ? (multiviewRef.current as any)
              : (qualityRef.current as any)
          }
          onFocus={() => handleFocus('play-pause')}
          onBlur={() => {
            focusedControlRef.current = null;
          }}
          onPress={onTogglePlayPause}
          style={({ focused }) => [
            styles.playButton,
            focused && styles.playButtonFocused,
          ]}
        >
          {() => (
            <Image
              source={paused ? playIcon : pauseIcon}
              style={styles.playIcon}
              resizeMode="contain"
            />
          )}
        </Pressable>

        {/* Timestamp / Live Badge */}
        {!isLive ? (
          <Text style={styles.timeText}>
            {formatDuration(displayedTime)} / {formatDuration(duration)}
          </Text>
        ) : (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {/* Flexible spacer pushing action buttons to the right */}
        <View style={styles.flexSpacer} />

        {/* LIVE ONLY: Other Sources */}
        {showSources ? (
          <Pressable
            ref={sourcesRef}
            testID="sources-button"
            focusable={true}
            hasTVPreferredFocus={lastFocusedControl === 'sources'}
            nextFocusLeft={playRef.current as any}
            nextFocusRight={multiviewRef.current as any}
            onFocus={() => handleFocus('sources')}
            onBlur={() => {
              focusedControlRef.current = null;
            }}
            onPress={onOpenSources}
            style={({ focused }) => [
              styles.actionCard,
              focused && styles.actionCardFocused,
            ]}
          >
            {({ focused }) => (
              <>
                <Image
                  source={sourcesIcon}
                  style={[
                    styles.actionIcon,
                    focused && styles.actionIconFocused,
                  ]}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.actionText,
                    focused && styles.actionTextFocused,
                  ]}
                >
                  {t('playerSources')}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {/* LIVE ONLY: Multi View */}
        {isLive ? (
          <Pressable
            ref={multiviewRef}
            testID="multiview-button"
            focusable={true}
            hasTVPreferredFocus={lastFocusedControl === 'multiview'}
            nextFocusLeft={
              showSources
                ? (sourcesRef.current as any)
                : (playRef.current as any)
            }
            nextFocusRight={qualityRef.current as any}
            onFocus={() => handleFocus('multiview')}
            onBlur={() => {
              focusedControlRef.current = null;
            }}
            onPress={onOpenMultiView}
            style={({ focused }) => [
              styles.actionCard,
              focused && styles.actionCardFocused,
            ]}
          >
            {({ focused }) => (
              <>
                <Image
                  source={multiviewIcon}
                  style={[
                    styles.actionIcon,
                    focused && styles.actionIconFocused,
                  ]}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.actionText,
                    focused && styles.actionTextFocused,
                  ]}
                >
                  {t('playerMultiView')}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {/* Quality Button */}
        <Pressable
          ref={qualityRef}
          testID="quality-button"
          focusable={true}
          hasTVPreferredFocus={lastFocusedControl === 'quality'}
          nextFocusLeft={
            isLive ? (multiviewRef.current as any) : (playRef.current as any)
          }
          onFocus={() => handleFocus('quality')}
          onBlur={() => {
            focusedControlRef.current = null;
          }}
          onPress={onOpenQuality}
          style={({ focused }) => [
            styles.actionCard,
            focused && styles.actionCardFocused,
          ]}
        >
          {({ focused }) => (
            <>
              <Image
                source={settingsIcon}
                style={[styles.actionIcon, focused && styles.actionIconFocused]}
                resizeMode="contain"
              />
              <Text
                style={[styles.actionText, focused && styles.actionTextFocused]}
              >
                {t('playerQuality')}
              </Text>
            </>
          )}
        </Pressable>

        {/* Stream Resolution Badge */}
        <Text style={styles.resolutionBadgeText}>{resolutionBadge}</Text>
      </TVFocusGuideView>
    </TVFocusGuideView>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 48,
    paddingBottom: 28,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
  },
  timelineContainer: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  timelineFocused: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 165, 233, 0.22)',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 1.5,
  },
  progressThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    top: -5.5,
    marginLeft: -7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  flexSpacer: {
    flex: 1,
  },
  playButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonFocused: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 165, 233, 0.22)',
  },
  playIcon: {
    width: 22,
    height: 24,
    tintColor: '#ffffff',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    marginLeft: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 64,
  },
  actionCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 1.5,
    backgroundColor: 'rgba(14, 165, 233, 0.25)',
    transform: [{ scale: 1.05 }],
  },
  actionIcon: {
    width: 18,
    height: 18,
    tintColor: '#ffffff',
  },
  actionIconFocused: {
    tintColor: '#ffffff',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  actionTextFocused: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  resolutionBadgeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 4,
    paddingHorizontal: 4,
  },
});
