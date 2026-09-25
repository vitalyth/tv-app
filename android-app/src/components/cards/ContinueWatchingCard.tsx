import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ContinueWatchingItem } from '../../services/watchProgress';
import { RemoteImage } from '../RemoteImage';
import { t } from '../../i18n';

const cardScrim = require('../../assets/card_scrim.png');

interface ContinueWatchingCardProps {
  item: ContinueWatchingItem;
  width: number;
  height: number;
  focused: boolean;
}

export const ContinueWatchingCard = memo(function ContinueWatchingCardView({
  item,
  width,
  height,
  focused,
}: ContinueWatchingCardProps) {
  const percent = Math.min(100, Math.max(0, item.progressPercentage || 0));

  return (
    <View
      accessibilityLabel={`${t('continueWatching')}: ${item.seriesTitle ?? ''} - ${item.title}`}
      style={[
        styles.cardContainer,
        { width, height },
        focused && styles.cardContainerFocused,
      ]}
    >
      <View style={styles.cardSurface}>
        {item.imageUrl ? (
          <RemoteImage
            uri={item.imageUrl}
            fallbackUri={item.backdropUrl ?? undefined}
            resizeMode="cover"
            style={styles.cardImage}
          />
        ) : null}
        {/* Smooth, continuous gradient scrim without horizontal stripes */}
        <Image
          source={cardScrim}
          resizeMode="stretch"
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.kickerRow}>
          <Text style={styles.cardKicker}>{t('continueWatching')}</Text>
          <Text style={styles.percentText}>{percent}%</Text>
        </View>

        <View style={styles.bottomBar}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {item.title}
            {item.seriesTitle ? ` · ${item.seriesTitle}` : ''}
          </Text>
        </View>

        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
        </View>
      </View>
      {focused ? <View pointerEvents="none" style={styles.focusBorder} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
    overflow: 'visible',
    borderRadius: 8,
    backgroundColor: '#0f1f2b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  cardContainerFocused: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 14,
  },
  cardSurface: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#0f1f2b',
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  focusBorder: {
    position: 'absolute',
    top: -3,
    right: -3,
    bottom: -3,
    left: -3,
    borderColor: '#ffffff',
    borderRadius: 11,
    borderWidth: 3,
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  cardShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 14, 0.55)',
  },
  kickerRow: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardKicker: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  percentText: {
    color: '#ddd6fe',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomBar: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: 11,
    justifyContent: 'flex-end',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#a78bfa',
  },
});

