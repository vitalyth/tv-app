import React, { useState } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { VodSeason } from '../../types/vod';

interface SeasonPillProps {
  season: VodSeason;
  isSelected: boolean;
  onSelect: (season: VodSeason) => void;
  hasPreferredFocus?: boolean;
}

export const SeasonPill: React.FC<SeasonPillProps> = ({
  season,
  isSelected,
  onSelect,
  hasPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      hasTVPreferredFocus={hasPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={() => onSelect(season)}
      style={[
        styles.pill,
        isSelected && styles.pillSelected,
        isFocused && styles.pillFocused,
      ]}
    >
      <Text
        style={[
          styles.text,
          isSelected && styles.textSelected,
          isFocused && styles.textFocused,
        ]}
      >
        {season.title}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillSelected: {
    backgroundColor: 'rgba(37, 212, 222, 0.2)',
    borderColor: '#25D4DE',
  },
  pillFocused: {
    backgroundColor: '#F2F4F7',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.06 }],
    elevation: 6,
  },
  text: {
    fontSize: 13,
    color: '#8E95A2',
    fontWeight: '500',
  },
  textSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  textFocused: {
    color: '#0A0E14',
    fontWeight: 'bold',
  },
});

export default SeasonPill;

