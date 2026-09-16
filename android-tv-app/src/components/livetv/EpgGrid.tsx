import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { TvChannel, TvProgram, GuideData } from '../../types/guide';
import LiveTvTimeline from './LiveTvTimeline';
import EpgRow from './EpgRow';

interface EpgGridProps {
  data: GuideData | null;
  isLoading: boolean;
  error?: string | null;
  selectedChannel: TvChannel | null;
  playingChannel: TvChannel | null;
  onChannelPress: (channel: TvChannel) => void;
  onChannelFocus?: (channel: TvChannel, index: number) => void;
  onProgramPress: (channel: TvChannel, program: TvProgram) => void;
  onProgramFocus?: (channel: TvChannel, program: TvProgram) => void;
  targetFocusIndex?: number;
  cardFocusNonce?: number;
}

export const EpgGrid: React.FC<EpgGridProps> = ({
  data,
  isLoading,
  error,
  selectedChannel,
  playingChannel,
  onChannelPress,
  onChannelFocus,
  onProgramPress,
  onProgramFocus,
  targetFocusIndex = 0,
  cardFocusNonce = 0,
}) => {
  if (isLoading && (!data || data.channels.length === 0)) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#E2E8F0" />
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

  return (
    <View style={styles.container}>
      {/* Timeline Header */}
      <View style={styles.timelineHeader}>
        <View style={styles.channelHeaderPlaceholder}>
          <Text style={styles.channelHeaderText}>ערוצים</Text>
        </View>
        <View style={styles.timelineContainer}>
          <LiveTvTimeline />
        </View>
      </View>

      {/* Vertical Channels & Program Rows */}
      <FlatList
        data={data.channels}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: channel, index }) => {
          const programs = data.programsByChannel[channel.id] || [];
          const isTargeted = index === targetFocusIndex && cardFocusNonce > 0;
          return (
            <EpgRow
              channel={channel}
              programs={programs}
              isSelectedChannel={selectedChannel?.id === channel.id}
              isPlayingChannel={playingChannel?.id === channel.id}
              onChannelPress={onChannelPress}
              onChannelFocus={(ch) => onChannelFocus?.(ch, index)}
              onProgramPress={onProgramPress}
              onProgramFocus={onProgramFocus}
              hasPreferredFocus={index === 0}
              focusNonce={isTargeted ? cardFocusNonce : 0}
            />
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  channelHeaderPlaceholder: {
    width: 140,
    height: 36,
    backgroundColor: '#17181B',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelHeaderText: {
    color: '#8E95A2',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timelineContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
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

