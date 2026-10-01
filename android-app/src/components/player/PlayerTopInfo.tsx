import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MediaItem } from '../../media/player';
import { RemoteImage } from '../RemoteImage';

interface PlayerTopInfoProps {
  item: MediaItem;
}

function getFormattedTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const LiveClock = memo(function LiveClockView() {
  const [time, setTime] = useState(getFormattedTime);

  useEffect(() => {
    const update = () => setTime(getFormattedTime());
    update();
    const interval = setInterval(update, 1000);
    (interval as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(interval);
  }, []);

  return <Text style={styles.clock}>{time}</Text>;
});

export const PlayerTopInfo = memo(function PlayerTopInfoView({
  item,
}: PlayerTopInfoProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(item.fallbackImageUrl) && !logoFailed;

  let subInfo = '';
  if (item.kind === 'live') {
    subInfo = item.timeRange || '';
  } else {
    const parts: string[] = [];
    if (item.timeRange) {
      parts.push(item.timeRange);
    }
    const episodePart = [item.seasonName, item.episodeName]
      .filter(Boolean)
      .join(' • ');
    if (episodePart) {
      parts.push(episodePart);
    }
    if (item.programName && item.programName !== item.title) {
      parts.push(item.programName);
    }
    subInfo = parts.join(' | ');
  }

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {/* Channel Logo */}
        {showLogo ? (
          <View style={styles.logoContainer}>
            <RemoteImage
              uri={item.fallbackImageUrl!}
              resizeMode="contain"
              style={styles.logoImage}
              onError={() => setLogoFailed(true)}
            />
          </View>
        ) : item.channelName ? (
          <View style={styles.channelNamePill}>
            <Text style={styles.channelNameText}>{item.channelName}</Text>
          </View>
        ) : null}

        {/* Text Information */}
        <View style={styles.textContainer}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>

          {subInfo ? (
            <Text numberOfLines={1} style={styles.subInfo}>
              {subInfo}
            </Text>
          ) : null}

          {item.description ? (
            <Text numberOfLines={2} style={styles.description}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rightSection}>
        <LiveClock />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 48,
    paddingTop: 32,
    paddingBottom: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 32,
    gap: 18,
  },
  logoContainer: {
    height: 38,
    maxWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 72,
    height: 38,
  },
  channelNamePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  channelNameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 26,
  },
  subInfo: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  description: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 680,
  },
  rightSection: {
    paddingTop: 4,
  },
  clock: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
