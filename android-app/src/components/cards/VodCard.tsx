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

  return (
    <View
      accessibilityLabel={`VOD: ${item.channelName ?? ''} - ${item.title}`}
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
        <View style={styles.cardShade} />

        <View style={styles.kickerRow}>
          <View style={styles.kickerLeft}>
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
          {item.channelNumber ? (
            <Text style={styles.seasonBadge}>{item.channelNumber}</Text>
          ) : null}
        </View>

        <Text numberOfLines={1} style={styles.cardTitle}>
          {item.title}
        </Text>
        {!showLogo && item.channelName ? (
          <Text numberOfLines={1} style={styles.cardCaption}>
            {item.channelName}
          </Text>
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
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  cardKicker: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  seasonBadge: {
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
});
