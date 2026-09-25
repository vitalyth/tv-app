import { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { MediaItem } from '../media/player';
import type { RouteDefinition } from '../navigation/routes';
import { RemoteImage } from './RemoteImage';

interface IntroRegionProps {
  route: RouteDefinition;
  focusedItem?: MediaItem | null;
}

const ChannelLogoBadge = memo(function ChannelLogoBadgeView({
  uri,
  fallbackUri,
}: {
  uri?: string;
  fallbackUri?: string;
}) {
  const [hasError, setHasError] = useState(false);
  if ((!uri && !fallbackUri) || hasError) {
    return null;
  }

  const effectiveUri = fallbackUri || uri || '';

  return (
    <View style={styles.logoContainer}>
      <RemoteImage
        uri={effectiveUri}
        fallbackUri={fallbackUri}
        resizeMode="cover"
        style={styles.logoImage}
        onError={() => setHasError(true)}
      />
    </View>
  );
});

export const IntroRegion = memo(function IntroRegionView({
  route,
  focusedItem,
}: IntroRegionProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const currentKey = focusedItem?.id ?? route.id;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(22);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentKey, fadeAnim, slideAnim]);

  if (!focusedItem) {
    return <View style={styles.root} />;
  }

  const isLive = focusedItem.kind === 'live';
  const isVod = focusedItem.kind === 'vod';

  let subtitle = focusedItem.channelName || '';
  if (isLive && focusedItem.channelNumber) {
    subtitle = `${focusedItem.channelNumber}  ${focusedItem.channelName ?? ''}`.trim();
  } else if (isVod) {
    const parts = [
      focusedItem.channelName,
      focusedItem.seasonName || focusedItem.channelNumber,
      focusedItem.episodeName && focusedItem.episodeName !== focusedItem.programName
        ? focusedItem.episodeName
        : undefined,
    ].filter(Boolean);
    subtitle = parts.join(' · ');
  }

  const title =
    (isVod ? focusedItem.programName : undefined) ||
    focusedItem.title ||
    route.title;
  const description = focusedItem.description || route.description;
  const timeRange = isLive ? focusedItem.timeRange : undefined;
  const logoUri = focusedItem.fallbackImageUrl || focusedItem.imageUrl;

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* 1. Metadata row with Logo, Badge, Subtitle, TimeRange */}
      <View style={styles.metadataRow}>
        {logoUri ? (
          <ChannelLogoBadge
            uri={logoUri}
            fallbackUri={focusedItem.fallbackImageUrl}
          />
        ) : null}

        {isLive ? (
          <View style={styles.liveBadge}>
            <Text style={styles.badgeIcon}>▶</Text>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        ) : isVod ? (
          <View style={styles.vodBadge}>
            <Text style={styles.vodBadgeText}>VOD</Text>
          </View>
        ) : null}

        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitleText}>
            {subtitle}
          </Text>
        ) : null}

        {timeRange ? (
          <Text numberOfLines={1} style={styles.timeRangeText}>
            ·  {timeRange}
          </Text>
        ) : null}
      </View>

      {/* 2. Hero Title */}
      <Text numberOfLines={2} style={styles.title}>
        {title}
      </Text>

      {/* 3. Hero Description */}
      {description ? (
        <View style={styles.descriptionContainer}>
          <Text numberOfLines={3} style={styles.description}>
            {description}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    height: 180,
    justifyContent: 'center',
    maxWidth: '75%',
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    marginBottom: 6,
    gap: 8,
  },
  logoContainer: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E21D2F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  badgeIcon: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D4DE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  vodBadgeText: {
    color: '#091016',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitleText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  timeRangeText: {
    color: '#B8C1CC',
    fontSize: 13,
    fontWeight: '400',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
    marginBottom: 6,
  },
  descriptionContainer: {
    maxHeight: 66,
    overflow: 'hidden',
  },
  description: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
