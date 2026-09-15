import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { TvProgram } from '../../types/guide';
import ProgressBar from '../common/ProgressBar';

interface EpgProgramCardProps {
  program: TvProgram;
  width: number;
  isSelected?: boolean;
  onPress: (program: TvProgram) => void;
  onFocus?: (program: TvProgram) => void;
  hasPreferredFocus?: boolean;
}

export const EpgProgramCard: React.FC<EpgProgramCardProps> = React.memo(({
  program,
  width,
  isSelected = false,
  onPress,
  onFocus,
  hasPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.(program);
  };

  const isLive = program.isLive;

  return (
    <Pressable
      hasTVPreferredFocus={hasPreferredFocus}
      onFocus={handleFocus}
      onBlur={() => setIsFocused(false)}
      onPress={() => onPress(program)}
      style={[
        styles.card,
        { width: Math.max(width, 100) },
        isSelected && styles.cardSelected,
        isFocused && styles.cardFocused,
      ]}
    >
      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            isFocused ? styles.titleFocused : styles.titleNormal,
          ]}
        >
          {program.title}
        </Text>

        <Text
          numberOfLines={1}
          style={[
            styles.timeRange,
            isFocused ? styles.timeRangeFocused : styles.timeRangeNormal,
          ]}
        >
          {program.timeRange || ''}
        </Text>
      </View>

      {/* Live indicator / Progress bar */}
      {isLive && program.progress !== undefined && (
        <View style={styles.progressWrapper}>
          <ProgressBar progress={program.progress} height={3} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    height: 60,
    backgroundColor: '#202020',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#4A4A4A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: 'rgba(37, 212, 222, 0.6)',
  },
  cardFocused: {
    backgroundColor: '#F2F4F7',
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  titleNormal: {
    color: '#FFFFFF',
  },
  titleFocused: {
    color: '#0A0E14',
  },
  timeRange: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'left',
  },
  timeRangeNormal: {
    color: '#8E95A2',
  },
  timeRangeFocused: {
    color: '#344054',
  },
  progressWrapper: {
    marginTop: 4,
  },
});

export default EpgProgramCard;
