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

  const programName = item.programName || item.title;
  const episodeName =
    item.episodeName && item.episodeName !== programName
      ? item.episodeName
      : undefined;
  const season = item.seasonName || item.channelNumber;

  return (
    <View
      accessibilityLabel={`VOD: ${item.channelName ?? ''} - ${programName}${season ? ` - ${season}` : ''}${episodeName ? ` - ${episodeName}` : ''}`}
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

        {/* Multi-layer gradient scrim for contrast against background artwork */}
        <View pointerEvents="none" style={styles.cardBaseTint} />
        <View pointerEvents="none" style={styles.scrimLayer1} />
        <View pointerEvents="none" style={styles.scrimLayer2} />
        <View pointerEvents="none" style={styles.scrimLayer3} />

        {/* All content at the very bottom */}
        <View style={styles.bottomContent}>
          {/* 1. Meta row: Channel Logo, VOD badge, Season */}
          <View style={styles.metaRow}>
            {showLogo ? (
              <ChannelLogoBadge
                uri={item.fallbackImageUrl!}
                onError={() => setLogoFailed(true)}
              />
            ) : null}
            <View style={styles.kickerBadge}>
              <Text style={styles.cardKicker}>VOD</Text>
            </View>
            {season ? (
              <View style={styles.seasonBadge}>
                <Text style={styles.seasonBadgeText}>{season}</Text>
              </View>
            ) : null}
          </View>

          {/* 2. Program name */}
          <Text numberOfLines={1} style={styles.programTitle}>
            {programName}
          </Text>

          {/* 3. Episode name */}
          {episodeName ? (
            <Text numberOfLines={1} style={styles.episodeTitle}>
              {episodeName}
            </Text>
          ) : !showLogo && item.channelName ? (
            <Text numberOfLines={1} style={styles.episodeTitle}>
              {item.channelName}
            </Text>
          ) : null}
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
  cardBaseTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 12, 0.2)',
  },
  scrimLayer1: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '75%',
    backgroundColor: 'rgba(2, 6, 12, 0.35)',
  },
  scrimLayer2: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    backgroundColor: 'rgba(2, 6, 12, 0.45)',
  },
  scrimLayer3: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '28%',
    backgroundColor: 'rgba(2, 6, 12, 0.45)',
  },
  bottomContent: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: 9,
    justifyContent: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
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
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  seasonBadgeText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '600',
  },
  programTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  episodeTitle: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});
