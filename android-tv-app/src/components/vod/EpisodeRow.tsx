import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { VodEpisode } from '../../types/vod';
import EpisodeCard from './EpisodeCard';

interface EpisodeRowProps {
  episodes: VodEpisode[];
  onEpisodePress: (episode: VodEpisode) => void;
  onEpisodeFocus?: (episode: VodEpisode) => void;
}

export const EpisodeRow: React.FC<EpisodeRowProps> = ({
  episodes,
  onEpisodePress,
  onEpisodeFocus,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>
        פרקים ({episodes.length})
      </Text>

      {episodes.length === 0 ? (
        <Text style={styles.emptyText}>אין פרקים זמינים בעונה זו</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {episodes.map((episode, index) => (
            <EpisodeCard
              key={episode.id || `ep-${index}`}
              episode={episode}
              onPress={onEpisodePress}
              onFocus={onEpisodeFocus}
              hasPreferredFocus={index === 0}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 14,
    color: '#8E95A2',
    textAlign: 'right',
    marginTop: 8,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 16,
  },
});

export default EpisodeRow;

