import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { MediaItem } from '../../media/player';
import { RemoteImage } from '../RemoteImage';

const cardScrim = require('../../assets/card_scrim.png');

interface ChannelLogoBadgeProps {
  uri: string;
  onError?: () => void;
}

const ChannelLogoBadge = memo(function ChannelLogoBadgeView({
  uri,
  onError,
}: ChannelLogoBadgeProps) {
  const [hasError, setHasError] = useState(false);
  if (!uri || hasError) {
    return null;
  }

  return (
    <View style={styles.logoBadge}>
      <RemoteImage
        uri={uri}
        resizeMode="cover"
        style={styles.logoBadgeImage}
        onError={() => {
          setHasError(true);
          onError?.();
        }}
      />
    </View>
  );
});

interface VodCardProps {
  item: MediaItem;
  width: number;
  height: number;
  focused: boolean;
}

export const VodCard = memo(function VodCardView({
  item,
  width,
  height,
  focused,
}: VodCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo =
    Boolean(item.fallbackImageUrl && item.fallbackImageUrl !== item.imageUrl) &&
    !logoFailed;

  const programName = item.programName || item.title;
  const episodeName =
    item.episodeName && item.episodeName !== programName
      ? item.episodeName
      : undefined;
  const season = item.seasonName || item.channelNumber;

  const displayTitle = episodeName
    ? `${programName} · ${episodeName}`
    : programName;

  return (
    <View
      accessibilityLabel={`VOD: ${item.channelName ?? ''} - ${displayTitle}${season ? ` - ${season}` : ''}`}
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
            fallbackUri={item.fallbackImageUrl}
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

        {/* 1. Top bar: Channel logo, VOD badge, Season badge */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            {showLogo ? (
              <ChannelLogoBadge
                uri={item.fallbackImageUrl!}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
            <View style={styles.kickerBadge}>
              <Text style={styles.cardKicker}>VOD</Text>
            </View>
          </View>
          {season ? (
            <View style={styles.seasonBadge}>
              <Text style={styles.seasonBadgeText}>{season}</Text>
            </View>
          ) : null}
        </View>

        {/* 2. Bottom bar: Program & Episode name in a single compact line */}
        <View style={styles.bottomBar}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {displayTitle}
          </Text>
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
  topBar: {
    position: 'absolute',
    top: 9,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  kickerBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  cardKicker: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  seasonBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  seasonBadgeText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '600',
  },
  bottomBar: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: 9,
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
});
