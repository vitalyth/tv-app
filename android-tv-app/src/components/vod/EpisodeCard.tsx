import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { VodEpisode } from '../../types/vod';
import { TvBadge } from '../common/TvBadge';
import ProgressBar from '../common/ProgressBar';

interface EpisodeCardProps {
  episode: VodEpisode;
  onPress: (episode: VodEpisode) => void;
  onFocus?: (episode: VodEpisode) => void;
  hasPreferredFocus?: boolean;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = React.memo(({
  episode,
  onPress,
  onFocus,
  hasPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.(episode);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <Pressable
      hasTVPreferredFocus={hasPreferredFocus}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={() => onPress(episode)}
      style={[
        styles.card,
        isFocused && styles.cardFocused,
      ]}
    >
      {/* Episode Thumbnail */}
      {episode.imageUrl ? (
        <Image
          source={{ uri: episode.imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderText}>▶</Text>
        </View>
      )}

      {/* Top Vod Badge */}
      <View style={styles.badgeWrapper}>
        <TvBadge type="vod" />
      </View>

      {/* Text Content */}
      <View style={styles.contentContainer}>
        <Text
          numberOfLines={2}
          style={styles.title}
        >
          {episode.title}
        </Text>
        {episode.description ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {episode.description}
          </Text>
        ) : null}
      </View>

      {/* Watch Progress if present */}
      {episode.progress !== undefined && episode.progress > 0 && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={episode.progress} height={5} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 238,
    height: 154,
    borderRadius: 8,
    backgroundColor: '#17181B',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    marginRight: 14,
  },
  cardFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    zIndex: 10,
  },
  placeholder: {
    backgroundColor: '#1B222D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  badgeWrapper: {
    position: 'absolute',
    top: 9,
    left: 9,
    zIndex: 2,
  },
  contentContainer: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    zIndex: 2,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '500',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default EpisodeCard;
