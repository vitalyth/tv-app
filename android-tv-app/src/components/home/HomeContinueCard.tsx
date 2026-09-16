import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvBadge } from '../common/TvBadge';
import { ProgressBar } from '../common/ProgressBar';
import { VodRecentItem } from '../../types/vod';

interface HomeContinueCardProps {
  item: VodRecentItem;
  hasTVPreferredFocus?: boolean;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  isFirstCard?: boolean;
  isLastCard?: boolean;
  onPress: () => void;
  onFocus: () => void;
}

export const HomeContinueCard: React.FC<HomeContinueCardProps> = React.memo(({
  item,
  hasTVPreferredFocus = false,
  hasPreferredFocus = false,
  focusNonce = 0,
  isFirstCard = false,
  isLastCard = false,
  onPress,
  onFocus,
}) => {
  return (
    <TvFocusable
      onPress={onPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus || hasPreferredFocus}
      focusNonce={focusNonce}
      lockUp={true}
      lockDown={true}
      lockLeft={isFirstCard}
      lockRight={isLastCard}
      scaleOnFocus={false}
      style={styles.card}
      focusedStyle={styles.cardFocused}
    >
      <View style={styles.contentBox}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}

        <View style={styles.badgeRow}>
          <TvBadge type="vod" />
          {item.channelLogo && (
            <View style={styles.channelBadgeBox}>
              <Image
                source={{ uri: item.channelLogo }}
                style={styles.channelBadgeLogo}
                resizeMode="contain"
              />
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.episodeTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.seriesTitle ? (
            <Text style={styles.seriesTitle} numberOfLines={1}>
              {item.seriesTitle}
            </Text>
          ) : null}
        </View>

        {(() => {
          const rawItem = item as any;
          const pos = rawItem.positionMs;
          const dur = rawItem.durationMs;
          const pct = rawItem.progressPercentage;
          const hasProgress = (pct !== undefined && pct > 0) || (Boolean(pos) && pos > 1000);
          if (!hasProgress) return null;
          const progressVal = (pct !== undefined && pct > 0) ? pct : (dur && dur > 0 ? pos / dur : 0.1);
          return (
            <View style={styles.progressWrapper}>
              <ProgressBar progress={progressVal} height={5} />
            </View>
          );
        })()}
      </View>
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 238,
    height: 164,
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
  },
  contentBox: {
    flex: 1,
    backgroundColor: '#17181B',
  },
  badgeRow: {
    position: 'absolute',
    top: 9,
    left: 9,
    right: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  channelBadgeBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(8, 10, 12, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  channelBadgeLogo: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: 'transparent',
    zIndex: 2,
    gap: 2,
  },
  episodeTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  seriesTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  progressWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
});

export default HomeContinueCard;
