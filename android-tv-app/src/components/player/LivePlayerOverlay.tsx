import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  BackHandler,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { TvChannel, TvProgram, TvStreamSource } from '../../types/guide';
import { api } from '../../services/api';
import { getStreamType } from '../../utils/stream';

interface LivePlayerOverlayProps {
  channel: TvChannel;
  program?: TvProgram | null;
  channels?: TvChannel[];
  hasExternalVideo?: boolean;
  externalIsBuffering?: boolean;
  isVideoReady?: boolean;
  onClose: () => void;
  onSelectChannel?: (channel: TvChannel) => void;
  onSelectSourceUrl?: (url: string) => void;
}

export const LivePlayerOverlay: React.FC<LivePlayerOverlayProps> = ({
  channel,
  program,
  channels = [],
  hasExternalVideo = false,
  externalIsBuffering = false,
  isVideoReady = false,
  onClose,
  onSelectChannel,
  onSelectSourceUrl,
}) => {
  const videoRef = useRef<VideoRef>(null);
  const [selectedSource, setSelectedSource] = useState<TvStreamSource>(
    channel.sources[0] || { name: 'ראשי', url: channel.streamUrl, isDirect: true }
  );
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string>(
    selectedSource.url || channel.streamUrl
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const [sourceMenuVisible, setSourceMenuVisible] = useState(false);
  const [isBuffering, setIsBuffering] = useState(!hasExternalVideo);

  // Focus states
  const [isCloseFocused, setIsCloseFocused] = useState(false);
  const [isPeekFocused, setIsPeekFocused] = useState(false);
  const [isPrevFocused, setIsPrevFocused] = useState(false);
  const [isNextFocused, setIsNextFocused] = useState(false);
  const [focusedSourceIdx, setFocusedSourceIdx] = useState(0);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceMenuVisibleRef = useRef(sourceMenuVisible);
  const focusedSourceIdxRef = useRef(focusedSourceIdx);

  useEffect(() => {
    sourceMenuVisibleRef.current = sourceMenuVisible;
  }, [sourceMenuVisible]);

  useEffect(() => {
    focusedSourceIdxRef.current = focusedSourceIdx;
  }, [focusedSourceIdx]);

  // Sync selected source when channel changes
  useEffect(() => {
    const initial = channel.sources[0] || { name: 'ראשי', url: channel.streamUrl, isDirect: true };
    setSelectedSource(initial);
    setResolvedStreamUrl(initial.url);
    if (!hasExternalVideo) {
      setIsBuffering(true);
    }
  }, [channel, hasExternalVideo]);

  // Dynamically resolve high-speed tokenized stream (matching Next.js channelService.getLiveChannel)
  useEffect(() => {
    if (hasExternalVideo) return; // External root player manages the stream!
    let isMounted = true;
    setIsBuffering(true);

    const stream = selectedSource.url || channel.streamUrl;
    if (stream) {
      setResolvedStreamUrl(stream);
      setIsBuffering(false);
      return;
    }

    const raw =
      selectedSource.rawChannel ||
      (selectedSource.url === channel.sources[0]?.url ? channel.rawChannel : null);

    if (raw) {
      api
        .getLiveChannelStream(raw)
        .then((liveUrl) => {
          if (!isMounted) return;
          if (liveUrl) {
            setResolvedStreamUrl(liveUrl);
          } else {
            setResolvedStreamUrl(channel.streamUrl);
          }
        })
        .catch(() => {
          if (isMounted) {
            setResolvedStreamUrl(channel.streamUrl);
          }
        });
    } else {
      setResolvedStreamUrl(channel.streamUrl);
    }

    return () => {
      isMounted = false;
    };
  }, [selectedSource, channel, hasExternalVideo]);

  // Sync focused index with active source
  useEffect(() => {
    const idx = channel.sources.findIndex((s) => s.url === selectedSource.url);
    if (idx >= 0) {
      setFocusedSourceIdx(idx);
    }
  }, [channel.sources, selectedSource]);

  // Back button handling
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sourceMenuVisible) {
        setSourceMenuVisible(false);
        showControlsTemporarily();
        return true;
      }
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [sourceMenuVisible, onClose]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!sourceMenuVisible) {
        setControlsVisible(false);
      }
    }, 4500);
  }, [sourceMenuVisible]);

  // Reset menu timeout on interaction
  const resetSourceMenuTimeout = useCallback(() => {
    if (sourceMenuTimeoutRef.current) clearTimeout(sourceMenuTimeoutRef.current);
    sourceMenuTimeoutRef.current = setTimeout(() => {
      setSourceMenuVisible(false);
      showControlsTemporarily();
    }, 7000);
  }, [showControlsTemporarily]);

  useEffect(() => {
    showControlsTemporarily();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (sourceMenuTimeoutRef.current) clearTimeout(sourceMenuTimeoutRef.current);
    };
  }, [showControlsTemporarily]);

  const handleOpenSourceMenu = useCallback(() => {
    setSourceMenuVisible(true);
    resetSourceMenuTimeout();
  }, [resetSourceMenuTimeout]);

  const handleSelectSource = useCallback((source: TvStreamSource) => {
    setSelectedSource(source);
    setIsBuffering(true);
    setSourceMenuVisible(false);
    showControlsTemporarily();
    if (source.url) {
      onSelectSourceUrl?.(source.url);
    }
  }, [showControlsTemporarily, onSelectSourceUrl]);

  const currentChannelIndex = channels.findIndex((c) => c.id === channel.id);
  const handlePrevChannel = useCallback(() => {
    if (channels.length <= 1) return;
    const prevIdx = (currentChannelIndex - 1 + channels.length) % channels.length;
    onSelectChannel?.(channels[prevIdx]);
    showControlsTemporarily();
  }, [channels, currentChannelIndex, onSelectChannel, showControlsTemporarily]);

  const handleNextChannel = useCallback(() => {
    if (channels.length <= 1) return;
    const nextIdx = (currentChannelIndex + 1) % channels.length;
    onSelectChannel?.(channels[nextIdx]);
    showControlsTemporarily();
  }, [channels, currentChannelIndex, onSelectChannel, showControlsTemporarily]);

  // Hardware TV remote DPAD handling (1:1 with native Android app ProgramGuideApp.kt)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode }: { keyCode: number }) => {
        // DPAD_LEFT = 21, DPAD_RIGHT = 22, DPAD_UP = 19, DPAD_DOWN = 20, DPAD_CENTER = 23, ENTER = 66, NUMPAD_ENTER = 160
        // CHANNEL_UP = 166, CHANNEL_DOWN = 167, BACK = 4
        if (sourceMenuVisibleRef.current) {
          if (keyCode === 19) {
            // UP in source menu
            setFocusedSourceIdx((prev) => (prev > 0 ? prev - 1 : channel.sources.length - 1));
            resetSourceMenuTimeout();
          } else if (keyCode === 20) {
            // DOWN in source menu
            setFocusedSourceIdx((prev) => (prev < channel.sources.length - 1 ? prev + 1 : 0));
            resetSourceMenuTimeout();
          } else if (keyCode === 23 || keyCode === 66 || keyCode === 160) {
            // SELECT source
            const target = channel.sources[focusedSourceIdxRef.current];
            if (target) handleSelectSource(target);
          } else if (keyCode === 22 || keyCode === 4) {
            // RIGHT or BACK -> Close source menu
            setSourceMenuVisible(false);
            showControlsTemporarily();
          }
          return;
        }

        // Key actions during fullscreen playback
        if (keyCode === 21) {
          // DPAD_LEFT -> Open source menu
          if (channel.sources.length > 1) {
            handleOpenSourceMenu();
          } else {
            showControlsTemporarily();
          }
        } else if (keyCode === 22) {
          // DPAD_RIGHT -> Show controls
          showControlsTemporarily();
        } else if (keyCode === 19 || keyCode === 166) {
          // DPAD_UP / CHANNEL_UP -> Previous channel
          handlePrevChannel();
        } else if (keyCode === 20 || keyCode === 167) {
          // DPAD_DOWN / CHANNEL_DOWN -> Next channel
          handleNextChannel();
        } else if (keyCode === 23 || keyCode === 66 || keyCode === 160) {
          // DPAD_CENTER / ENTER -> Show controls
          showControlsTemporarily();
        }
      }
    );

    return () => sub.remove();
  }, [
    channel.sources,
    handleOpenSourceMenu,
    handleSelectSource,
    handlePrevChannel,
    handleNextChannel,
    resetSourceMenuTimeout,
    showControlsTemporarily,
  ]);

  const currentProgram = program || channel.currentProgram;
  const hasMultipleSources = channel.sources.length > 1;

  // Stream type resolved with explicit HLS precedence (matching native Android app)
  const activeStreamUrl = resolvedStreamUrl || selectedSource.url || channel.streamUrl;
  const streamType = getStreamType(activeStreamUrl);

  // Compute active buffering state
  const activeIsBuffering = hasExternalVideo
    ? externalIsBuffering && !isVideoReady
    : isBuffering;

  return (
    <View style={[styles.container, hasExternalVideo && styles.transparentContainer]}>
      {/* Video View */}
      {!hasExternalVideo && activeStreamUrl ? (
        <Video
          ref={videoRef}
          source={{
            uri: activeStreamUrl,
            type: streamType,
          }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          paused={false}
          onLoad={() => setIsBuffering(false)}
          onReadyForDisplay={() => setIsBuffering(false)}
          onProgress={() => {
            if (isBuffering) setIsBuffering(false);
          }}
          onBuffer={({ isBuffering: buffering }) => setIsBuffering(buffering)}
          onError={() => setIsBuffering(false)}
          maxBitRate={6000000}
          bufferConfig={{
            minBufferMs: 2500,
            maxBufferMs: 10000,
            bufferForPlaybackMs: 750,
            bufferForPlaybackAfterRebufferMs: 1500,
          }}
        />
      ) : null}

      {/* Buffering Indicator - floating badge, NO full screen dimming */}
      {activeIsBuffering && (
        <View style={styles.centerSpinner} pointerEvents="none">
          <View style={styles.spinnerBadge}>
            <ActivityIndicator size="large" color="#25D4DE" />
            <Text style={styles.bufferingText}>טוען שידור חי...</Text>
          </View>
        </View>
      )}

      {/* Center D-Pad focus target to receive TV remote navigation */}
      {!sourceMenuVisible && (
        <Pressable
          style={styles.centerFocusTarget}
          hasTVPreferredFocus={true}
          onFocus={showControlsTemporarily}
          onPress={showControlsTemporarily}
        />
      )}

      {/* Left Edge SourceMenuPeek Tab (Matching native SourceMenuPeek) */}
      {controlsVisible && !sourceMenuVisible && hasMultipleSources && (
        <View style={styles.peekWrapper}>
          <Pressable
            onFocus={() => {
              setIsPeekFocused(true);
              handleOpenSourceMenu();
            }}
            onBlur={() => setIsPeekFocused(false)}
            onPress={handleOpenSourceMenu}
            style={[styles.peekTab, isPeekFocused && styles.peekTabFocused]}
          >
            <View style={styles.peekBars}>
              <View style={[styles.peekBar, { width: 17 }]} />
              <View style={[styles.peekBar, { width: 23 }]} />
              <View style={[styles.peekBar, { width: 17 }]} />
            </View>
            <Text style={styles.peekLabel}>מקורות</Text>
          </Pressable>
        </View>
      )}

      {/* Source Selection Side Menu (Matching native SourceSelectionMenu) */}
      {sourceMenuVisible && (
        <View style={styles.sourceMenuContainer}>
          <View style={styles.sourceMenuPanel}>
            <Text style={styles.sourceMenuTitle}>מקורות שידור</Text>
            <Text style={styles.sourceMenuSubtitle}>
              {channel.number ? `${channel.number}  ${channel.name}` : channel.name}
            </Text>

            <ScrollView style={styles.sourceList} showsVerticalScrollIndicator={false}>
              {channel.sources.map((source, index) => {
                const isSelected = source.url === selectedSource.url;
                const isFocused = focusedSourceIdx === index;
                return (
                  <Pressable
                    key={source.url + index}
                    hasTVPreferredFocus={isSelected || (index === 0 && !channel.sources.some((s) => s.url === selectedSource.url))}
                    onFocus={() => {
                      setFocusedSourceIdx(index);
                      resetSourceMenuTimeout();
                    }}
                    onPress={() => handleSelectSource(source)}
                    style={[
                      styles.sourceItem,
                      isSelected && styles.sourceItemSelected,
                      isFocused && styles.sourceItemFocused,
                    ]}
                  >
                    <View
                      style={[
                        styles.sourceDot,
                        isSelected ? styles.sourceDotSelected : styles.sourceDotNormal,
                      ]}
                    />
                    <View style={styles.sourceItemTexts}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.sourceItemName,
                          (isSelected || isFocused) && styles.sourceItemNameActive,
                        ]}
                      >
                        {source.name}
                      </Text>
                      <Text
                        style={[
                          styles.sourceItemStatus,
                          isSelected ? styles.sourceItemStatusActive : null,
                        ]}
                      >
                        {isSelected ? 'מוצג' : 'זמין'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Overlay UI Controls */}
      {controlsVisible && !sourceMenuVisible && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar: Channel & Program Metadata */}
          <View style={styles.topBar}>
            <Pressable
              onFocus={() => setIsCloseFocused(true)}
              onBlur={() => setIsCloseFocused(false)}
              onPress={onClose}
              style={[styles.backButton, isCloseFocused && styles.buttonFocused]}
            >
              <Text style={[styles.backButtonText, isCloseFocused && styles.buttonTextFocused]}>
                ✕ חזרה
              </Text>
            </Pressable>

            <View style={styles.channelMeta}>
              <View style={styles.channelHeaderRow}>
                {channel.logoUrl ? (
                  <Image
                    source={{ uri: channel.logoUrl }}
                    style={styles.channelLogo}
                    resizeMode="contain"
                  />
                ) : null}
                <View>
                  <Text style={styles.channelNumberName}>
                    {channel.number ? `${channel.number} · ` : ''}{channel.name}
                  </Text>
                  <Text style={styles.liveTag}>שידור חי</Text>
                </View>
              </View>
              {currentProgram ? (
                <View style={styles.programInfo}>
                  <Text style={styles.programTitle} numberOfLines={1}>
                    {currentProgram.title}
                  </Text>
                  {currentProgram.timeRange ? (
                    <Text style={styles.programTime}>{currentProgram.timeRange}</Text>
                  ) : null}
                  {currentProgram.description ? (
                    <Text style={styles.programDesc} numberOfLines={2}>
                      {currentProgram.description}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* Bottom Bar: Source indicator & Channel Navigation Buttons */}
          <View style={styles.bottomBar}>
            <View style={styles.sourceBadgeBox}>
              <Text style={styles.sourceBadgeText}>
                מקור פעיל: {selectedSource.name}
              </Text>
              {hasMultipleSources && (
                <Text style={styles.sourceHintText}>
                  (ניווט שמאלה בשלט פותח את רשימת המקורות)
                </Text>
              )}
            </View>

            {channels.length > 1 && (
              <View style={styles.channelNavButtons}>
                <Pressable
                  onFocus={() => {
                    setIsPrevFocused(true);
                    showControlsTemporarily();
                  }}
                  onBlur={() => setIsPrevFocused(false)}
                  onPress={handlePrevChannel}
                  style={[styles.navButton, isPrevFocused && styles.buttonFocused]}
                >
                  <Text style={[styles.navButtonText, isPrevFocused && styles.buttonTextFocused]}>
                    ▲ ערוץ קודם
                  </Text>
                </Pressable>

                <Pressable
                  onFocus={() => {
                    setIsNextFocused(true);
                    showControlsTemporarily();
                  }}
                  onBlur={() => setIsNextFocused(false)}
                  onPress={handleNextChannel}
                  style={[styles.navButton, isNextFocused && styles.buttonFocused]}
                >
                  <Text style={[styles.navButtonText, isNextFocused && styles.buttonTextFocused]}>
                    ▼ ערוץ הבא
                  </Text>
                </Pressable>
              </View>
            )}
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
    zIndex: 99,
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
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#25D4DE',
    marginTop: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  centerFocusTarget: {
    position: 'absolute',
    top: '40%',
    left: '35%',
    width: '30%',
    height: '20%',
    opacity: 0,
    zIndex: 10,
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 36,
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(8, 14, 20, 0.82)',
    borderRadius: 14,
    padding: 16,
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  buttonFocused: {
    borderColor: '#25D4DE',
    backgroundColor: 'rgba(37, 212, 222, 0.3)',
    transform: [{ scale: 1.05 }],
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonTextFocused: {
    color: '#FFFFFF',
  },
  channelMeta: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: 24,
  },
  channelHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 6,
  },
  channelLogo: {
    width: 44,
    height: 44,
    marginLeft: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  channelNumberName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  liveTag: {
    color: '#25D4DE',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  programInfo: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  programTitle: {
    color: '#F2F4F7',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  programTime: {
    color: '#9FB1B8',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
  },
  programDesc: {
    color: '#B8C1CC',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'right',
    maxWidth: 600,
  },
  bottomBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(8, 14, 20, 0.82)',
    borderRadius: 14,
    padding: 16,
  },
  sourceBadgeBox: {
    alignItems: 'flex-end',
  },
  sourceBadgeText: {
    color: '#25D4DE',
    fontSize: 15,
    fontWeight: 'bold',
  },
  sourceHintText: {
    color: '#9FB1B8',
    fontSize: 12,
    marginTop: 2,
  },
  channelNavButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  navButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  /* Source Selection Peek Tab (Matching native SourceMenuPeek) */
  peekWrapper: {
    position: 'absolute',
    left: 0,
    top: '42%',
    zIndex: 105,
  },
  peekTab: {
    width: 60,
    height: 72,
    backgroundColor: 'rgba(8, 20, 26, 0.94)',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 212, 222, 0.4)',
    borderLeftWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 6,
  },
  peekTabFocused: {
    backgroundColor: 'rgba(37, 212, 222, 0.4)',
    borderColor: '#25D4DE',
    transform: [{ scale: 1.1 }],
  },
  peekBars: {
    alignItems: 'center',
    gap: 4,
  },
  peekBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#25D4DE',
  },
  peekLabel: {
    color: '#25D4DE',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  /* Source Selection Side Menu Panel (Matching native SourceSelectionMenu) */
  sourceMenuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 110,
  },
  sourceMenuPanel: {
    position: 'absolute',
    left: 0,
    top: '12%',
    width: 320,
    maxHeight: '76%',
    backgroundColor: '#08141A',
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 212, 222, 0.3)',
    borderLeftWidth: 0,
    padding: 18,
    elevation: 16,
  },
  sourceMenuTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  sourceMenuSubtitle: {
    color: '#9FB1B8',
    fontSize: 13,
    marginTop: 3,
    marginBottom: 14,
    textAlign: 'right',
  },
  sourceList: {
    flexGrow: 0,
  },
  sourceItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 54,
    borderRadius: 10,
    backgroundColor: 'rgba(32, 36, 42, 0.54)',
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sourceItemSelected: {
    backgroundColor: 'rgba(37, 212, 222, 0.16)',
    borderColor: 'rgba(37, 212, 222, 0.35)',
  },
  sourceItemFocused: {
    borderColor: '#25D4DE',
    backgroundColor: 'rgba(234, 251, 252, 0.25)',
    transform: [{ scale: 1.03 }],
  },
  sourceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  sourceDotSelected: {
    backgroundColor: '#25D4DE',
  },
  sourceDotNormal: {
    backgroundColor: '#667078',
  },
  sourceItemTexts: {
    flex: 1,
    alignItems: 'flex-end',
  },
  sourceItemName: {
    color: '#D7E0E4',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  sourceItemNameActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sourceItemStatus: {
    color: '#9FB1B8',
    fontSize: 11,
    marginTop: 1,
  },
  sourceItemStatusActive: {
    color: '#25D4DE',
    fontWeight: '600',
  },
});

export default LivePlayerOverlay;
