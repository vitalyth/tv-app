import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import TVPressable from './TVPressable';
import { Colors, Radius, CardSize } from '../utils/theme';
import { getAssetUrl, VodItem } from '../services/tvApi';

interface Props {
  item: VodItem;
  onPress: (item: VodItem) => void;
  variant?: 'new' | 'recent';
}

export default function VodItemCard({ item, onPress, variant = 'new' }: Props) {
  const isRecent = variant === 'recent';
  const image = item.episodeImage || item.logo;
  const title = item.episodeName || item.title || item.name;
  const channel = item.channelName || item.programName || item.module;
  const date = item.aired || item.season || item.episode || '';
  return (
    <TVPressable
      onPress={() => onPress(item)}
      style={styles.card}
      focusStyle={styles.focusCard}
    >
      {/* Thumbnail */}
      <View style={styles.thumb}>
        <Image source={{ uri: getAssetUrl(image) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {/* Dark gradient overlay */}
        <View style={styles.gradient} />

        {/* Play button */}
        <View style={styles.playBtn}>
          <Text style={styles.playIcon}>▶</Text>
        </View>

        {/* Top-right badge */}
        {isRecent ? (
          <View style={[styles.badge, styles.badgeRecent]}>
            <Text style={styles.badgeText}>🕐 המשך</Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeNew]}>
            <Text style={styles.badgeText}>חדש ▶</Text>
          </View>
        )}

        {/* Episode label bottom-right */}
        {item.episode ? (
          <View style={styles.episodeBadge}>
            <Text style={styles.episodeText}>{item.episode}</Text>
          </View>
        ) : null}
      </View>

      {/* Info row */}
      <View style={styles.info}>
        <Text style={styles.channel}>{channel}</Text>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {date ? <Text style={styles.date}>{date}</Text> : null}
      </View>
    </TVPressable>
  );
}

const { width, height } = CardSize.vodItem;

const styles = StyleSheet.create({
  card: {
    width,
    marginLeft: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  focusCard: {
    borderColor: Colors.borderFocus,
  },
  thumb: {
    width,
    height,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  gradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  playBtn: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 2,
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 9,
    borderRadius: Radius.badge,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeNew: {
    backgroundColor: Colors.new,
  },
  badgeRecent: {
    backgroundColor: Colors.accent,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  episodeBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.badge,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  episodeText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
  info: {
    padding: 11,
    gap: 3,
  },
  channel: {
    fontSize: 12,
    color: Colors.textSub,
    textAlign: 'right',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 20,
  },
  date: {
    fontSize: 12,
    color: Colors.textSub,
    textAlign: 'right',
    marginTop: 2,
  },
});
