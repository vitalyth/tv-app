import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { getDisplayedQualityLabel } from './qualityDisplay';

const playIcon = require('../../assets/icons/play.png');
const pauseIcon = require('../../assets/icons/pause.png');
const sourcesIcon = require('../../assets/icons/sources.png');
const multiviewIcon = require('../../assets/icons/multiview.png');

export type ControlId =
  | 'timeline'
  | 'play-pause'
  | 'go-live'
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

function formatWallClock(timestampMs: number): string {
  const d = new Date(timestampMs);
  const hrs = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hrs}:${mins}`;
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
  const hasTimeshift = isLive && Number.isFinite(duration) && duration > 15;
  const canSeek = (!isLive && Number.isFinite(duration) && duration > 0) || (isLive && hasTimeshift);
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const seekPositionRef = useRef<number | null>(null);
  const focusedControlRef = useRef<ControlId | null>(null);
  const previousRowControlRef = useRef<ControlId>('play-pause');
  const displayedTime = seekPosition ?? currentTime;

  // Live Timeshift / DVR status
  const behindSeconds = isLive && hasTimeshift ? Math.max(0, duration - displayedTime) : 0;
  const isAtLiveEdge = !isLive || !hasTimeshift || behindSeconds <= 12;
  const showGoLiveButton = isLive && hasTimeshift && !isAtLiveEdge;

  // Current wall clock for timeline bounds
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) {
      return;
    }
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isLive]);

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

  const handleGoLive = useCallback(() => {
    if (isLive && hasTimeshift) {
      seekPositionRef.current = duration;
      setSeekPosition(duration);
      onSeek(duration);
    }
  }, [isLive, hasTimeshift, duration, onSeek]);

  // Calculate timeline percentage
  let progressPct = 0;
  if (isLive) {
    if (hasTimeshift && duration > 0) {
      progressPct = Math.min(100, Math.max(0, (displayedTime / duration) * 100));
    } else {
      progressPct = 100;
    }
  } else if (duration > 0) {
    progressPct = Math.min(100, Math.max(0, (displayedTime / duration) * 100));
  }

  const qualityValue = getDisplayedQualityLabel(
    selectedQualityId,
    videoQualities,
  );

  const playRef = useRef<View>(null);
  const goLiveRef = useRef<View>(null);
  const sourcesRef = useRef<View>(null);
  const multiviewRef = useRef<View>(null);
  const qualityRef = useRef<View>(null);
  const timelineRef = useRef<View>(null);
  const focusRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const requestControlFocus = useCallback(
    (id: ControlId) => {
      const target =
        id === 'timeline'
          ? timelineRef
          : id === 'quality'
          ? qualityRef
          : id === 'sources' && showSources
          ? sourcesRef
          : id === 'multiview' && isLive
          ? multiviewRef
          : id === 'go-live' && showGoLiveButton
          ? goLiveRef
          : playRef;
      target.current?.requestTVFocus?.();
    },
    [isLive, showSources, showGoLiveButton],
  );

  const clearFocusRecovery = useCallback(() => {
    if (focusRecoveryTimerRef.current !== null) {
      clearTimeout(focusRecoveryTimerRef.current);
      focusRecoveryTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearFocusRecovery, [clearFocusRecovery]);

  const handleFocus = (id: ControlId) => {
    clearFocusRecovery();
    focusedControlRef.current = id;
    if (id !== 'timeline') {
      previousRowControlRef.current = id;
    }
    onFocusControl(id);
  };

  const handleBlur = (id: ControlId) => {
    if (focusedControlRef.current === id) {
      focusedControlRef.current = null;
      clearFocusRecovery();
      focusRecoveryTimerRef.current = setTimeout(() => {
        focusRecoveryTimerRef.current = null;
        if (focusedControlRef.current === null) {
          requestControlFocus(id);
        }
      }, 80);
    }
  };

  useEffect(() => {
    if (focusedControlRef.current === lastFocusedControl) {
      return;
    }
    const timer = setTimeout(() => {
      requestControlFocus(lastFocusedControl);
    }, 50);
    return () => clearTimeout(timer);
  }, [lastFocusedControl, requestControlFocus]);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }

    const focusedControl = focusedControlRef.current;
    if (!focusedControl) {
      if (['up', 'down', 'left', 'right'].includes(event.eventType)) {
        clearFocusRecovery();
        requestControlFocus(lastFocusedControl);
      }
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
            : previous === 'go-live' && showGoLiveButton
            ? goLiveRef
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
      if (focusedControl === 'play-pause') {
        const next = showGoLiveButton
          ? 'go-live'
          : showSources
          ? 'sources'
          : isLive
          ? 'multiview'
          : 'quality';
        const target =
          next === 'go-live'
            ? goLiveRef
            : next === 'sources'
            ? sourcesRef
            : next === 'multiview'
            ? multiviewRef
            : qualityRef;
        target.current?.requestTVFocus?.();
      } else if (focusedControl === 'go-live') {
        const next = showSources ? 'sources' : isLive ? 'multiview' : 'quality';
        const target =
          next === 'sources'
            ? sourcesRef
            : next === 'multiview'
            ? multiviewRef
            : qualityRef;
        target.current?.requestTVFocus?.();
      } else if (focusedControl === 'sources') {
        multiviewRef.current?.requestTVFocus?.();
      } else if (focusedControl === 'multiview') {
        qualityRef.current?.requestTVFocus?.();
      } else if (focusedControl === 'quality') {
        qualityRef.current?.requestTVFocus?.();
      }
    } else if (event.eventType === 'left') {
      if (focusedControl === 'quality') {
        const prev = isLive ? 'multiview' : 'play-pause';
        const target = prev === 'multiview' ? multiviewRef : playRef;
        target.current?.requestTVFocus?.();
      } else if (focusedControl === 'multiview') {
        const target = showSources
          ? sourcesRef
          : showGoLiveButton
          ? goLiveRef
          : playRef;
        target.current?.requestTVFocus?.();
      } else if (focusedControl === 'sources') {
        const target = showGoLiveButton ? goLiveRef : playRef;
        target.current?.requestTVFocus?.();
      } else if (focusedControl === 'go-live') {
        playRef.current?.requestTVFocus?.();
      } else if (focusedControl === 'play-pause') {
        playRef.current?.requestTVFocus?.();
      }
    }
  });

  return (
    <TVFocusGuideView
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      style={styles.container}
    >
      {/* 1. Timeline Progress Bar */}
      <TVFocusGuideView trapFocusLeft trapFocusRight>
        <Pressable
          ref={timelineRef}
          testID="player-timeline"
          focusable={canSeek}
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
          onBlur={() => handleBlur('timeline')}
          style={styles.timelineContainer}
        >
          {({ focused }) => (
            <>
              {/* Timeline Clock Header */}
              <View style={styles.timelineClockRow}>
                <Text style={styles.timelineClockText}>
                  {isLive
                    ? hasTimeshift
                      ? formatWallClock(nowMs - duration * 1000)
                      : 'LIVE'
                    : formatDuration(0)}
                </Text>
                {isLive && hasTimeshift && !isAtLiveEdge ? (
                  <Text style={styles.timelineBehindText}>
                    -{formatDuration(behindSeconds)}
                  </Text>
                ) : null}
                <Text style={styles.timelineClockText}>
                  {isLive ? formatWallClock(nowMs) : formatDuration(duration)}
                </Text>
              </View>

              {/* Progress Track */}
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progressPct}%` }]}
                />
                {canSeek ? (
                  <View
                    style={[
                      styles.progressThumb,
                      { left: `${progressPct}%` },
                      focused && styles.progressThumbFocused,
                    ]}
                  />
                ) : null}
              </View>
            </>
          )}
        </Pressable>
      </TVFocusGuideView>

      {/* 2. Bottom Controls Row */}
      <TVFocusGuideView
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        destinations={
          [
            playRef.current,
            goLiveRef.current,
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
            showGoLiveButton
              ? (goLiveRef.current as any)
              : showSources
              ? (sourcesRef.current as any)
              : isLive
              ? (multiviewRef.current as any)
              : (qualityRef.current as any)
          }
          onFocus={() => handleFocus('play-pause')}
          onBlur={() => handleBlur('play-pause')}
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
        ) : isAtLiveEdge ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : (
          <View style={styles.behindBadge}>
            <View style={styles.behindDot} />
            <Text style={styles.behindText}>
              -{formatDuration(behindSeconds)}
            </Text>
          </View>
        )}

        {/* Go Live Button (Appears when behind LIVE) */}
        {showGoLiveButton ? (
          <Pressable
            ref={goLiveRef}
            testID="go-live-button"
            focusable={true}
            hasTVPreferredFocus={lastFocusedControl === 'go-live'}
            nextFocusLeft={playRef.current as any}
            nextFocusRight={
              showSources
                ? (sourcesRef.current as any)
                : isLive
                ? (multiviewRef.current as any)
                : (qualityRef.current as any)
            }
            onFocus={() => handleFocus('go-live')}
            onBlur={() => handleBlur('go-live')}
            onPress={handleGoLive}
            style={({ focused }) => [
              styles.goLiveButton,
              focused && styles.goLiveButtonFocused,
            ]}
          >
            {({ focused }) => (
              <Text
                style={[
                  styles.goLiveText,
                  focused && styles.goLiveTextFocused,
                ]}
              >
                ● {t('playerGoLive')}
              </Text>
            )}
          </Pressable>
        ) : null}

        {/* Flexible spacer pushing action buttons to the right */}
        <View style={styles.flexSpacer} />

        {/* LIVE ONLY: Other Sources */}
        {showSources ? (
          <Pressable
            ref={sourcesRef}
            testID="sources-button"
            focusable={true}
            hasTVPreferredFocus={lastFocusedControl === 'sources'}
            nextFocusLeft={
              showGoLiveButton
                ? (goLiveRef.current as any)
                : (playRef.current as any)
            }
            nextFocusRight={multiviewRef.current as any}
            onFocus={() => handleFocus('sources')}
            onBlur={() => handleBlur('sources')}
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
                : showGoLiveButton
                ? (goLiveRef.current as any)
                : (playRef.current as any)
            }
            nextFocusRight={qualityRef.current as any}
            onFocus={() => handleFocus('multiview')}
            onBlur={() => handleBlur('multiview')}
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
          onBlur={() => handleBlur('quality')}
          onPress={onOpenQuality}
          style={({ focused }) => [
            styles.actionCard,
            focused && styles.actionCardFocused,
          ]}
        >
          {({ focused }) => (
            <>
              <Text
                style={[styles.actionText, focused && styles.actionTextFocused]}
              >
                {t('playerQuality')}
              </Text>
              <Text
                testID="quality-value"
                style={[
                  styles.qualityValueText,
                  focused && styles.qualityValueTextFocused,
                ]}
              >
                {qualityValue}
              </Text>
            </>
          )}
        </Pressable>
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
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  timelineClockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timelineClockText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timelineBehindText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  progressThumbFocused: {
    transform: [{ scale: 1.7 }],
    borderColor: '#38bdf8',
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
  behindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.5)',
    marginLeft: 4,
  },
  behindDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#f97316',
  },
  behindText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  goLiveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    marginLeft: 8,
  },
  goLiveButtonFocused: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    transform: [{ scale: 1.05 }],
  },
  goLiveText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  goLiveTextFocused: {
    color: '#ffffff',
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
  qualityValueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 1,
  },
  qualityValueTextFocused: {
    color: '#38bdf8',
  },
});
