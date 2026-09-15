import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { VodEpisode, VodSeries, VodRecentItem } from '../../types/vod';
import ProgressBar from '../common/ProgressBar';
import { getStreamType } from '../../utils/stream';

interface VodPlayerOverlayProps {
  streamUrl?: string | null;
  episode?: VodEpisode | null;
  series?: VodSeries | null;
  recentItem?: VodRecentItem | null;
  resumePositionMs?: number;
  isResolving?: boolean;
  hasExternalVideo?: boolean;
  externalCurrentTime?: number;
  externalDuration?: number;
  externalIsPlaying?: boolean;
  externalIsBuffering?: boolean;
  onExternalTogglePlay?: () => void;
  onExternalSeek?: (deltaSeconds: number) => void;
  onClose: () => void;
  onSaveProgress?: (
    episodeId: string,
    seriesId?: string | null,
    positionMs?: number,
    durationMs?: number,
    item?: VodRecentItem | null
  ) => void;
}

export const VodPlayerOverlay: React.FC<VodPlayerOverlayProps> = ({
  streamUrl,
  episode,
  series,
  recentItem,
  resumePositionMs = 0,
  isResolving = false,
  hasExternalVideo = false,
  externalCurrentTime,
  externalDuration,
  externalIsPlaying,
  externalIsBuffering,
  onExternalTogglePlay,
  onExternalSeek,
  onClose,
  onSaveProgress,
}) => {
  const videoRef = useRef<VideoRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIsPlaying = hasExternalVideo && externalIsPlaying !== undefined ? externalIsPlaying : isPlaying;
  const activeCurrentTime = hasExternalVideo && externalCurrentTime !== undefined ? externalCurrentTime : currentTime;
  const activeDuration = hasExternalVideo && externalDuration !== undefined ? externalDuration : duration;
  const activeIsBuffering = hasExternalVideo && externalIsBuffering !== undefined ? externalIsBuffering : isBuffering;

  // Focus states for TV D-Pad buttons
  const [isCloseFocused, setIsCloseFocused] = useState(false);
  const [isRewindFocused, setIsRewindFocused] = useState(false);
  const [isPlayFocused, setIsPlayFocused] = useState(false);
  const [isForwardFocused, setIsForwardFocused] = useState(false);

  // Handle hardware back button on TV
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  // Hide controls after 4 seconds of inactivity
  const showControlsTemporarily = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4000);
  };

  useEffect(() => {
    showControlsTemporarily();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlayPause = () => {
    if (hasExternalVideo && onExternalTogglePlay) {
      onExternalTogglePlay();
    } else {
      setIsPlaying((prev) => !prev);
    }
    showControlsTemporarily();
  };

  const handleSeek = (deltaSeconds: number) => {
    if (hasExternalVideo && onExternalSeek) {
      onExternalSeek(deltaSeconds);
    } else {
      const target = Math.max(0, Math.min(activeDuration, activeCurrentTime + deltaSeconds));
      videoRef.current?.seek(target);
      setCurrentTime(target);
    }
    showControlsTemporarily();
  };

  const progressRatio = activeDuration > 0 ? activeCurrentTime / activeDuration : 0;

  const streamType = streamUrl ? getStreamType(streamUrl) : undefined;

  return (
    <View style={[styles.container, hasExternalVideo && styles.transparentContainer]}>
      {/* Video View */}
      {!hasExternalVideo && streamUrl ? (
        <Video
          ref={videoRef}
          source={{ uri: streamUrl, type: streamType }}
          style={StyleSheet.absoluteFill}
          paused={!activeIsPlaying}
          resizeMode="contain"
          onLoad={(data) => {
            setDuration(data.duration);
            setIsBuffering(false);
            if (resumePositionMs && resumePositionMs > 1000) {
              const seekSec = resumePositionMs / 1000;
              videoRef.current?.seek(seekSec);
              setCurrentTime(seekSec);
            }
          }}
          onReadyForDisplay={() => setIsBuffering(false)}
          onProgress={(data) => {
            if (isBuffering) setIsBuffering(false);
            setCurrentTime(data.currentTime);
            const epId = episode?.id || recentItem?.episodeId;
            const sId = series?.id || recentItem?.seriesId;
            if (epId && data.currentTime > 1) {
              onSaveProgress?.(
                epId,
                sId,
                data.currentTime * 1000,
                (duration || (data as any).seekableDuration || 0) * 1000,
                recentItem
              );
            }
          }}
          onBuffer={({ isBuffering: buffering }) => setIsBuffering(buffering)}
          onError={(err) => {
            console.warn('VodPlayerOverlay video error:', err);
            setIsBuffering(false);
          }}
        />
      ) : null}

      {/* Buffering Indicator - floating badge, NO full screen dimming */}
      {(activeIsBuffering || isResolving) && (
        <View style={styles.centerSpinner} pointerEvents="none">
          <View style={styles.spinnerBadge}>
            <ActivityIndicator size="large" color="#25D4DE" />
            <Text style={styles.bufferingText}>
              {isResolving ? 'טוען שידור...' : 'מאתחל...'}
            </Text>
          </View>
        </View>
      )}

      {/* Touch / Clickable backdrop to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={showControlsTemporarily}
      />

      {/* Overlay UI Controls */}
      {controlsVisible && (
        <View style={styles.controlsOverlay}>
          {/* Top Bar: Title & Back Button */}
          <View style={styles.topBar}>
            <Pressable
              hasTVPreferredFocus={true}
              onFocus={() => setIsCloseFocused(true)}
              onBlur={() => setIsCloseFocused(false)}
              onPress={onClose}
              style={[
                styles.backButton,
                isCloseFocused && styles.buttonFocused,
              ]}
            >
              <Text
                style={[
                  styles.backButtonText,
                  isCloseFocused && styles.buttonTextFocused,
                ]}
              >
                ✕ סגור
              </Text>
            </Pressable>

            <View style={styles.titleContainer}>
              <Text numberOfLines={1} style={styles.episodeTitle}>
                {episode?.title || series?.title || ''}
              </Text>
              {series?.title && episode?.title && (
                <Text style={styles.seriesSubtitle}>{series.title}</Text>
              )}
            </View>
          </View>

          {/* Bottom Bar: Seek Bar, Time & Controls */}
          <View style={styles.bottomBar}>
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{formatTime(activeCurrentTime)}</Text>
              <View style={styles.progressBarWrapper}>
                <ProgressBar progress={progressRatio} height={6} />
              </View>
              <Text style={styles.timeText}>{formatTime(activeDuration)}</Text>
            </View>

            <View style={styles.playbackActions}>
              <Pressable
                onFocus={() => setIsRewindFocused(true)}
                onBlur={() => setIsRewindFocused(false)}
                onPress={() => handleSeek(-10)}
                style={[
                  styles.actionButton,
                  isRewindFocused && styles.buttonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    isRewindFocused && styles.buttonTextFocused,
                  ]}
                >
                  -10s
                </Text>
              </Pressable>

              <Pressable
                onFocus={() => setIsPlayFocused(true)}
                onBlur={() => setIsPlayFocused(false)}
                onPress={togglePlayPause}
                style={[
                  styles.actionButton,
                  styles.playPauseButton,
                  isPlayFocused && styles.buttonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    isPlayFocused && styles.buttonTextFocused,
                  ]}
                >
                  {activeIsPlaying ? '❚❚ השהה' : '▶ נגן'}
                </Text>
              </Pressable>

              <Pressable
                onFocus={() => setIsForwardFocused(true)}
                onBlur={() => setIsForwardFocused(false)}
                onPress={() => handleSeek(10)}
                style={[
                  styles.actionButton,
                  isForwardFocused && styles.buttonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    isForwardFocused && styles.buttonTextFocused,
                  ]}
                >
                  +10s
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 100,
  },
  transparentContainer: {
    backgroundColor: 'transparent',
  },
  centerSpinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  spinnerBadge: {
    backgroundColor: 'rgba(6, 12, 18, 0.82)',
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37, 212, 222, 0.25)',
  },
  bufferingText: {
    color: '#E2E8F0',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 32,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  titleContainer: {
    alignItems: 'flex-end',
  },
  episodeTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  seriesSubtitle: {
    color: '#8E95A2',
    fontSize: 14,
    marginTop: 2,
  },
  bottomBar: {
    gap: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarWrapper: {
    flex: 1,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  playbackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  playPauseButton: {
    paddingHorizontal: 28,
    backgroundColor: 'rgba(37, 212, 222, 0.25)',
  },
  buttonFocused: {
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 1.08 }],
    elevation: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonTextFocused: {
    color: '#0A0E14',
  },
});

export default VodPlayerOverlay;

