import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { TvChannel, TvProgram } from '../../types/guide';
import EpgChannelCard from './EpgChannelCard';
import EpgProgramCard from './EpgProgramCard';

interface EpgRowProps {
  channel: TvChannel;
  programs: TvProgram[];
  isSelectedChannel: boolean;
  isPlayingChannel: boolean;
  onChannelPress: (channel: TvChannel) => void;
  onChannelFocus?: (channel: TvChannel) => void;
  onProgramPress: (channel: TvChannel, program: TvProgram) => void;
  onProgramFocus?: (channel: TvChannel, program: TvProgram) => void;
  hasPreferredFocus?: boolean;
}

export const EpgRow: React.FC<EpgRowProps> = ({
  channel,
  programs,
  isSelectedChannel,
  isPlayingChannel,
  onChannelPress,
  onChannelFocus,
  onProgramPress,
  onProgramFocus,
  hasPreferredFocus = false,
}) => {
  return (
    <View style={styles.row}>
      {/* Channel Header Card */}
      <EpgChannelCard
        channel={channel}
        isSelected={isSelectedChannel}
        isPlaying={isPlayingChannel}
        onPress={onChannelPress}
        onFocus={onChannelFocus}
        hasPreferredFocus={hasPreferredFocus}
      />

      {/* Programs Timeline Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.programsStrip}
      >
        {programs.map((program, idx) => {
          // Calculate width based on duration (180px per 30 mins, minimum 140px)
          const durationMins = program.durationMinutes || 30;
          const cardWidth = Math.max(120, (durationMins / 30) * 160);

          return (
            <EpgProgramCard
              key={program.id || `${channel.id}-prog-${idx}`}
              program={program}
              width={cardWidth}
              onPress={(p) => onProgramPress(channel, p)}
              onFocus={(p) => onProgramFocus?.(channel, p)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  programsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 32,
  },
});

export default EpgRow;

