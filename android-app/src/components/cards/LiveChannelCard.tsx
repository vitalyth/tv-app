import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MediaItem } from '../../media/player';
import { RemoteImage } from '../RemoteImage';

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
        <View style={styles.cardShade} />

        <View style={styles.kickerRow}>
          <View style={styles.kickerLeft}>
            {showLogo ? (
              <ChannelLogoBadge
                uri={channel.fallbackImageUrl!}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
            <View style={styles.kickerBadge}>
              <Text style={styles.cardKicker}>LIVE</Text>
            </View>
          </View>
          {channel.timeRange ? (
            <Text style={styles.timeRange}>{channel.timeRange}</Text>
          ) : null}
        </View>

        <Text numberOfLines={1} style={styles.cardTitle}>
          {channel.title}
        </Text>
        {!showLogo ? (
          <Text numberOfLines={1} style={styles.cardCaption}>
            {channel.channelNumber ? `${channel.channelNumber}  ` : ''}
            {channel.channelName}
          </Text>
        ) : null}

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
  kickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeImage: {
    width: '100%',
    height: '100%',
  },
  kickerBadge: {
    backgroundColor: 'rgba(255, 98, 108, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  cardKicker: {
    color: '#ff626c',
    fontSize: 11,
    fontWeight: '800',
  },
  timeRange: {
    color: '#c4d4e0',
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardCaption: {
    color: '#c0cbd4',
    fontSize: 12,
    marginTop: 3,
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
