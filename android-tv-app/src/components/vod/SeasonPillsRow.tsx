import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { VodSeason } from '../../types/vod';
import SeasonPill from './SeasonPill';

interface SeasonPillsRowProps {
  seasons: VodSeason[];
  selectedSeason: VodSeason | null;
  onSelectSeason: (season: VodSeason) => void;
}

export const SeasonPillsRow: React.FC<SeasonPillsRowProps> = ({
  seasons,
  selectedSeason,
  onSelectSeason,
}) => {
  if (seasons.length <= 1) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {seasons.map((season, index) => (
          <SeasonPill
            key={season.seasonId || `season-${index}`}
            season={season}
            isSelected={selectedSeason?.seasonId === season.seasonId}
            onSelect={onSelectSeason}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});

export default SeasonPillsRow;

