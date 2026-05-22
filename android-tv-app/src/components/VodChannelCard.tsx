import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import TVPressable from './TVPressable';
import { Colors, Radius, CardSize } from '../utils/theme';
import { getAssetUrl, VodChannel } from '../services/tvApi';

interface Props {
  channel: VodChannel;
  onPress: (ch: VodChannel) => void;
}

export default function VodChannelCard({ channel, onPress }: Props) {
  return (
    <TVPressable
      onPress={() => onPress(channel)}
      style={styles.card}
      focusStyle={styles.focusCard}
    >
      {/* VOD badge */}
      <View style={styles.vodBadge}>
        <Text style={styles.vodText}>VOD</Text>
        <Text style={styles.vodIcon}>📺</Text>
      </View>

      {/* Logo */}
      <View style={styles.logoWrap}>
        <Image source={{ uri: getAssetUrl(channel.logo) }} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Labels */}
      <Text style={styles.label} numberOfLines={1}>{channel.name}</Text>
      <Text style={styles.name}>{channel.module}</Text>
    </TVPressable>
  );
}

const { width, height } = CardSize.vodChannel;

const styles = StyleSheet.create({
  card: {
    width,
    height,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginLeft: 10,
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  focusCard: {
    borderColor: Colors.borderFocus,
    backgroundColor: Colors.surfaceElevated,
  },
  vodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vodText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  vodIcon: {
    fontSize: 11,
  },
  logoWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 75,
    height: 42,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  name: {
    fontSize: 11,
    color: Colors.textSub,
    textAlign: 'center',
    marginTop: 2,
  },
});
