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

interface LiveChannelCardProps {
  channel: MediaItem;
  width: number;
  height: number;
  focused: boolean;
}

export const LiveChannelCard = memo(function LiveChannelCardView({
  channel,
  width,
  height,
  focused,
}: LiveChannelCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const hasProgress =
    typeof channel.progressPercentage === 'number' &&
    channel.progressPercentage > 0 &&
    channel.progressPercentage <= 100;

  const showLogo = Boolean(channel.fallbackImageUrl) && !logoFailed;

  return (
    <View
      accessibilityLabel={`Live: ${channel.channelName ?? ''} - ${channel.title}`}
      style={[
        styles.cardContainer,
        { width, height },
        focused && styles.cardContainerFocused,
      ]}
    >
      <View style={styles.cardSurface}>
        {channel.imageUrl ? (
          <RemoteImage
            uri={channel.imageUrl}
            fallbackUri={channel.fallbackImageUrl}
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

        {/* 1. Top bar: Channel logo, LIVE badge, Time range */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            {showLogo ? (
              <ChannelLogoBadge
                uri={channel.fallbackImageUrl!}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
            <View style={styles.kickerBadge}>
              <Text style={styles.cardKicker}>LIVE</Text>
            </View>
            {!showLogo && channel.channelName ? (
              <Text numberOfLines={1} style={styles.channelNameFallback}>
                {channel.channelNumber ? `${channel.channelNumber}  ` : ''}
                {channel.channelName}
              </Text>
            ) : null}
          </View>
          {channel.timeRange ? (
            <Text style={styles.timeRange}>{channel.timeRange}</Text>
          ) : null}
        </View>

        {/* 2. Bottom bar: Program Name in a single compact line */}
        <View
          style={[
            styles.bottomBar,
            hasProgress && styles.bottomBarWithProgress,
          ]}
        >
          <Text numberOfLines={1} style={styles.cardTitle}>
            {channel.title}
          </Text>
        </View>

        {/* Progress bar at the bottom edge */}
        {hasProgress ? (
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.round(channel.progressPercentage || 0)}%` },
              ]}
            />
          </View>
        ) : null}
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
    backgroundColor: 'rgba(226, 29, 47, 0.9)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  cardKicker: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  channelNameFallback: {
    color: '#c0cbd4',
    fontSize: 11,
    fontWeight: '600',
  },
  timeRange: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: 9,
    justifyContent: 'flex-end',
  },
  bottomBarWithProgress: {
    paddingBottom: 11,
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
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ff626c',
  },
});
