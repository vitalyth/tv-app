import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { VodSeries, VOD_PROVIDERS, VodProvider } from '../../types/vod';
import { TvFocusable } from '../common/TvFocusable';

interface VodSeriesCardProps {
  series: VodSeries;
  onPress: (series: VodSeries) => void;
  onFocus?: (series: VodSeries) => void;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  lockLeft?: boolean;
  lockRight?: boolean;
}

export const VodSeriesCard: React.FC<VodSeriesCardProps> = React.memo(({
  series,
  onPress,
  onFocus,
  hasPreferredFocus = false,
  focusNonce = 0,
  lockLeft = false,
  lockRight = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.(series);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const imageUrl = series.imageUrl || series.posterUrl || series.backdropUrl;
  const providerInfo = series.providerId ? VOD_PROVIDERS[series.providerId as VodProvider] : null;

  return (
    <TvFocusable
      hasTVPreferredFocus={hasPreferredFocus}
      focusNonce={focusNonce}
      lockLeft={lockLeft}
      lockRight={lockRight}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={() => onPress(series)}
      scaleOnFocus={false}
      style={[
        styles.card,
        isFocused && styles.cardFocused,
      ]}
    >
      {/* Background Poster Image */}
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderText}>🎬</Text>
        </View>
      )}

      {/* Episode Count Badge (Top End) */}
      {series.episodeCount > 0 && (
        <View style={styles.episodeBadge}>
          <Text style={styles.episodeBadgeText}>
            {series.episodeCount} פרקים
          </Text>
        </View>
      )}

      {/* Bottom Scrim Overlay for Text Readability */}
      <View style={styles.scrimOverlay}>
        {providerInfo?.displayName ? (
          <View style={styles.providerPill}>
            <Text style={styles.providerPillText}>{providerInfo.displayName}</Text>
          </View>
        ) : null}

        <Text numberOfLines={1} style={styles.title}>
          {series.title}
        </Text>
      </View>
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  card: {
    height: 205,
    borderRadius: 8,
    backgroundColor: '#17181B',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cardFocused: {
    borderColor: '#F2F4F7',
    zIndex: 10,
  },
  placeholder: {
    backgroundColor: '#1B2230',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  episodeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(8, 10, 14, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex: 2,
  },
  episodeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  scrimOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 24,
    backgroundColor: 'rgba(8, 10, 12, 0.88)',
    justifyContent: 'flex-end',
    gap: 3,
  },
  providerPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(8, 10, 14, 0.8)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  providerPillText: {
    color: '#D0D5DD',
    fontSize: 10,
    fontWeight: '700',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
    color: '#FFFFFF',
  },
});

export default VodSeriesCard;
