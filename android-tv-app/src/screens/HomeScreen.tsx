import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Colors } from '../utils/theme';
import {
  LiveChannel,
  VodChannel,
  VodItem,
  tvApi,
} from '../services/tvApi';

import SectionHeader from '../components/SectionHeader';
import HorizontalCarousel from '../components/HorizontalCarousel';
import LiveChannelCard from '../components/LiveChannelCard';
import VodChannelCard from '../components/VodChannelCard';
import VodItemCard from '../components/VodItemCard';
import { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [liveChannels, setLiveChannels] = useState<LiveChannel[]>([]);
  const [vodChannels, setVodChannels] = useState<VodChannel[]>([]);
  const [recentVod, setRecentVod] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHomeData = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const [live, vod, recent] = await Promise.all([
        tvApi.getLiveChannels(),
        tvApi.getVodChannels(),
        tvApi.getVodRecent(),
      ]);

      setLiveChannels(live);
      setVodChannels(vod);
      setRecentVod(recent);
    } catch {
      setError('לא הצלחנו לטעון נתונים מהשרת');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const handleLivePress = (ch: LiveChannel) => {
    navigation.navigate('Player', {
      url: tvApi.getLiveStreamUrl(ch),
      title: ch.name,
      isLive: true,
    });
  };

  const handleVodChannelPress = (ch: VodChannel) => {
    navigation.navigate('VodCategory', {
      channelId: ch.id,
      channelName: ch.name,
      channelLogo: ch.logo,
    });
  };

  const handleVodItemPress = (item: VodItem) => {
    navigation.navigate('Player', {
      title: item.episodeName || item.title || item.name,
      vodItem: item,
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* ── HEADER ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRight}>
          <Text style={styles.headerTitle}>Best TV</Text>
          <Text style={styles.headerSub}>TV App</Text>
        </View>
        {/* Logo icon placeholder */}
        <View style={styles.logoCircle}>
          <Text style={styles.logoIcon}>📺</Text>
        </View>
      </View>

      {/* ── SCROLLABLE BODY ─────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHomeData(true)} />}
      >
        {error ? <Text style={styles.stateText}>{error}</Text> : null}
        {loading ? <Text style={styles.stateText}>טוען נתונים...</Text> : null}

        {/* ── 1. LIVE CHANNELS ─────────────────────────────── */}
        <SectionHeader title="ערוצים" subtitle="כל הערוצים החיים במקום אחד" />
        <HorizontalCarousel>
          {liveChannels.map((ch, i) => (
            <LiveChannelCard
              key={ch.id}
              channel={ch}
              onPress={handleLivePress}
              hasTVPreferredFocus={i === 0}
            />
          ))}
        </HorizontalCarousel>

        <View style={styles.divider} />

        {/* ── 2. VOD CHANNELS ──────────────────────────────── */}
        <SectionHeader title="VOD" subtitle="ספריות לצפייה לפי ערוץ" />
        <HorizontalCarousel>
          {vodChannels.map((ch) => (
            <VodChannelCard
              key={ch.id}
              channel={ch}
              onPress={handleVodChannelPress}
            />
          ))}
        </HorizontalCarousel>

        <View style={styles.divider} />

        {/* ── 3. NEW IN VOD ─────────────────────────────────── */}
        <SectionHeader title="חדש ב-VOD" subtitle="פרקים ותוכניות שנוספו לאחרונה" />
        <HorizontalCarousel>
          {recentVod.map((item) => (
            <VodItemCard
              key={item.id}
              item={item}
              onPress={handleVodItemPress}
              variant="new"
            />
          ))}
        </HorizontalCarousel>

        <View style={styles.divider} />

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSub,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoIcon: {
    fontSize: 22,
  },

  // ── Scroll body ─────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 28,
  },
  stateText: {
    color: Colors.textSub,
    fontSize: 16,
    textAlign: 'right',
    paddingHorizontal: 36,
    marginBottom: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 36,
    marginVertical: 28,
  },
  bottomPad: {
    height: 40,
  },
});
