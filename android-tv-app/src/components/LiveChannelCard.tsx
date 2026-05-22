import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import TVPressable from './TVPressable';
import { Colors, Radius, CardSize } from '../utils/theme';
import { getAssetUrl, LiveChannel } from '../services/tvApi';

interface Props {
  channel: LiveChannel;
  onPress: (ch: LiveChannel) => void;
  hasTVPreferredFocus?: boolean;
}

export default function LiveChannelCard({ channel, onPress, hasTVPreferredFocus }: Props) {
  return (
    <TVPressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={() => onPress(channel)}
      style={styles.card}
      focusStyle={styles.focusCard}
    >
      {/* LIVE badge top-right */}
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>

      {/* Logo centered */}
      <View style={styles.logoWrap}>
        <Image source={{ uri: getAssetUrl(channel.logo) }} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Channel name */}
      <Text style={styles.name} numberOfLines={1}>{channel.name}</Text>
    </TVPressable>
  );
}

const { width, height } = CardSize.live;

const styles = StyleSheet.create({
  card: {
    width,
    height,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  focusCard: {
    borderColor: Colors.borderFocus,
    backgroundColor: Colors.surfaceElevated,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(229,66,43,0.15)',
    borderRadius: Radius.badge,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.live,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.live,
    letterSpacing: 0.5,
  },
  logoWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 65,
    height: 38,
  },
  name: {
    fontSize: 12,
    color: Colors.textSub,
    textAlign: 'center',
  },
});
