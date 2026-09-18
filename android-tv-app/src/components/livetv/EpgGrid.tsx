import React, { useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { TvChannel, TvProgram, GuideData } from '../../types/guide';
import {
  CHANNEL_WIDTH,
  HEADER_HEIGHT,
  ACTIVE_ROW_HEIGHT,
  INACTIVE_ROW_HEIGHT,
  HALF_HOUR_SECONDS,
  SLOT_WIDTH,
  displayProgramsForChannel,
  preferredFirstVisibleRow,
} from '../../utils/epgUtils';
import LiveTvTimeline from './LiveTvTimeline';
import EpgChannelCard from './EpgChannelCard';
import EpgRow from './EpgRow';

interface EpgGridProps {
  data: GuideData | null;
  programsMap?: Record<string, TvProgram[]>;
  isLoading: boolean;
  error?: string | null;
  selectedRowIndex: number;
  selectedProgramIndex: number;
  focusedColumn: 'channel' | 'program';
  isGridFocused?: boolean;
  playingChannel: TvChannel | null;
  scrollOffsetAnim: Animated.Value;
  scrollYAnim: Animated.Value;
  scrollOffsetPx?: number;
  viewportWidth?: number;
  timelineStartSeconds: number;
  timelineEndSeconds: number;
  nowSeconds: number;
  onChannelPress: (channel: TvChannel) => void;
  onProgramPress: (channel: TvChannel, program: TvProgram) => void;
}

export const EpgGrid: React.FC<EpgGridProps> = ({
  data,
  programsMap: externalProgramsMap,
  isLoading,
  error,
  selectedRowIndex,
  selectedProgramIndex,
  focusedColumn,
  isGridFocused = true,
  playingChannel,
  scrollOffsetAnim,
  scrollYAnim,
  scrollOffsetPx,
  viewportWidth,
  timelineStartSeconds,
  timelineEndSeconds,
  nowSeconds,
  onChannelPress,
  onProgramPress,
}) => {
  if (isLoading && (!data || data.channels.length === 0)) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#25D4DE" />
      </View>
    );
  }

  if (error && (!data || data.channels.length === 0)) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!data || data.channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>לוח השידורים אינו זמין כרגע</Text>
      </View>
    );
  }

  // Pre-calculate filled programs for each channel (with gap placeholders)
  const channels = data.channels;
  const programsMap = externalProgramsMap || {};

  const showLiveLine = nowSeconds >= timelineStartSeconds && nowSeconds <= timelineEndSeconds;
  const nowOffsetPx = showLiveLine
    ? ((nowSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH
    : -1;

  // Total width of the timeline
  const totalSlots = Math.max(1, Math.floor((timelineEndSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS));
  const timelineContentWidth = totalSlots * SLOT_WIDTH;

  return (
    <View style={styles.container}>
      {/* 1. Sticky Left Column: Channel Header + Channel Cards */}
      <View style={styles.channelsColumn}>
        {/* Top-Left Corner Spacer (Transparent empty space matching reference app) */}
        <View style={styles.channelHeaderPlaceholder} />

        {/* Channels List (Vertically Animated) */}
        <View style={styles.channelsListViewport}>
          <Animated.View
            style={{
              transform: [{ translateY: Animated.multiply(scrollYAnim, -1) }],
            }}
          >
            {channels.map((channel, idx) => {
              const isActiveRow = idx === selectedRowIndex;
              const isChannelFocused = Boolean(isGridFocused && isActiveRow && focusedColumn === 'channel');
              const rowHeight = isActiveRow ? ACTIVE_ROW_HEIGHT : INACTIVE_ROW_HEIGHT;
              const isPlaying = playingChannel?.id === channel.id;

              return (
                <View key={channel.id} style={{ height: rowHeight, justifyContent: 'center' }}>
                  <EpgChannelCard
                    channel={channel}
                    height={rowHeight}
                    isActiveRow={isActiveRow}
                    isFocused={isChannelFocused}
                    isPlaying={isPlaying}
                  />
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>

      {/* 2. Horizontally Scrolling Viewport: Timeline Header + Program Rows */}
      <View style={styles.timelineAndProgramsViewport}>
        {/* Top Timeline Header (Horizontally Animated Only) */}
        <View style={styles.timelineHeaderRow}>
          <Animated.View
            style={{
              width: timelineContentWidth,
              transform: [{ translateX: Animated.multiply(scrollOffsetAnim, -1) }],
            }}
          >
            <LiveTvTimeline
              startSeconds={timelineStartSeconds}
              endSeconds={timelineEndSeconds}
              nowSeconds={nowSeconds}
            />
          </Animated.View>
        </View>

        {/* Program Rows (Horizontally AND Vertically Animated) */}
        <View style={styles.programsGridViewport}>
          <Animated.View
            style={{
              width: timelineContentWidth,
              transform: [
                { translateX: Animated.multiply(scrollOffsetAnim, -1) },
                { translateY: Animated.multiply(scrollYAnim, -1) },
              ],
            }}
          >
            {channels.map((channel, idx) => {
              const isActiveRow = idx === selectedRowIndex;
              const rowHeight = isActiveRow ? ACTIVE_ROW_HEIGHT : INACTIVE_ROW_HEIGHT;
              const programs = programsMap[channel.id] || [];
              const focusedProgIdx = isGridFocused && isActiveRow && focusedColumn === 'program' ? selectedProgramIndex : -1;
              const isPlaying = playingChannel?.id === channel.id;

              return (
                <EpgRow
                  key={channel.id}
                  channel={channel}
                  programs={programs}
                  timelineStartSeconds={timelineStartSeconds}
                  timelineEndSeconds={timelineEndSeconds}
                  scrollOffsetPx={scrollOffsetPx}
                  viewportWidth={viewportWidth}
                  rowHeight={rowHeight}
                  isActiveRow={isActiveRow}
                  focusedProgramIndex={focusedProgIdx}
                  isPlayingChannel={isPlaying}
                  nowSeconds={nowSeconds}
                  onProgramPress={onProgramPress}
                />
              );
            })}
          </Animated.View>
        </View>

        {/* Vertical Red LIVE Line extending down from bottom of NOW bubble across all rows */}
        {showLiveLine && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.verticalLiveLineContainer,
              {
                width: timelineContentWidth,
                transform: [{ translateX: Animated.multiply(scrollOffsetAnim, -1) }],
              },
            ]}
          >
            <View
              style={[
                styles.verticalLiveLine,
                { left: nowOffsetPx - 1 },
              ]}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 330,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  channelsColumn: {
    width: CHANNEL_WIDTH,
    height: 330,
    zIndex: 10,
  },
  channelHeaderPlaceholder: {
    height: HEADER_HEIGHT,
    backgroundColor: 'transparent',
    marginRight: 6,
    marginBottom: 0,
  },
  channelsListViewport: {
    height: 290,
    overflow: 'hidden',
  },
  timelineAndProgramsViewport: {
    flex: 1,
    height: 330,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineHeaderRow: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
    zIndex: 5,
  },
  programsGridViewport: {
    height: 290,
    overflow: 'hidden',
    position: 'relative',
  },
  verticalLiveLineContainer: {
    position: 'absolute',
    top: 28,
    bottom: 0,
    left: 0,
    zIndex: 999,
    elevation: 99,
  },
  verticalLiveLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(226, 29, 47, 0.95)',
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
  emptyText: {
    color: '#8E95A2',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default EpgGrid;
