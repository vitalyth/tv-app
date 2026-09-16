import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvBadge } from '../common/TvBadge';
import { TvChannel, TvProgram } from '../../types/guide';

interface HomeLiveCardProps {
  channel: TvChannel;
  program?: TvProgram | null;
  hasTVPreferredFocus?: boolean;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  isFirstCard?: boolean;
  isLastCard?: boolean;
  onPress: () => void;
  onFocus: () => void;
}

export const HomeLiveCard: React.FC<HomeLiveCardProps> = React.memo(({
  channel,
  program,
  hasTVPreferredFocus = false,
  hasPreferredFocus = false,
  focusNonce = 0,
  isFirstCard = false,
  isLastCard = false,
  onPress,
  onFocus,
}) => {
  const currentProgram = program || channel.currentProgram;

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
        {/* Background Image / Thumbnail covering full box space */}
        {currentProgram?.imageUrl ? (
          <Image
            source={{ uri: currentProgram.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : channel.logoUrl ? (
          <Image
            source={{ uri: channel.logoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}

        {/* Top Badges */}
        <View style={styles.badgeRow}>
          <TvBadge type="live" />
          {channel.logoUrl ? (
            <View style={styles.channelBadgeBox}>
              <Image
                source={{ uri: channel.logoUrl }}
                style={styles.channelBadgeLogo}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>

        {/* Bottom Text Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.programTitle} numberOfLines={1}>
            {currentProgram?.title || 'שידור חי'}
          </Text>
          {currentProgram?.description ? (
            <Text style={styles.programDescription} numberOfLines={1}>
              {currentProgram.description}
            </Text>
          ) : currentProgram?.timeRange ? (
            <Text style={styles.timeRange} numberOfLines={1}>
              {currentProgram.timeRange}
            </Text>
          ) : null}
        </View>
      </View>
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 238,
    height: 154,
    borderRadius: 8,
    backgroundColor: '#171B22',
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
    backgroundColor: '#171B22',
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
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 2,
    gap: 2,
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  programTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  programDescription: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  timeRange: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
});

export default HomeLiveCard;
