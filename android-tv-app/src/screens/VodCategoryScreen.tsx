import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Colors, Radius } from '../utils/theme';
import { getAssetUrl, toVodNode, tvApi, vodItemToNode, VodChannel, VodItem, VodNode } from '../services/tvApi';
import { RootStackParamList } from '../../App';
import SectionHeader from '../components/SectionHeader';
import HorizontalCarousel from '../components/HorizontalCarousel';
import VodItemCard from '../components/VodItemCard';
import TVPressable from '../components/TVPressable';

type Props = NativeStackScreenProps<RootStackParamList, 'VodCategory'>;
type Nav  = NativeStackNavigationProp<RootStackParamList>;

export default function VodCategoryScreen({ route }: Props) {
  const { channelId, channelName, channelLogo } = route.params;
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<VodItem[]>([]);
  const [stack, setStack] = useState<VodNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async (node: VodNode, nextStack: VodNode[]) => {
    setLoading(true);
    setError(null);
    try {
      setItems(await tvApi.getVodItems(node));
      setStack(nextStack);
    } catch {
      setError('לא הצלחנו לטעון את פריטי ה-VOD');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    tvApi.getVodChannels()
      .then((channels) => {
        if (!active) return;
        const channel = channels.find((item) => item.id === channelId);
        if (!channel) {
          setLoading(false);
          setError('ערוץ ה-VOD לא נמצא');
          return;
        }

        const rootNode = toVodNode(channel as VodChannel);
        loadItems(rootNode, [rootNode]);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError('לא הצלחנו לטעון את ערוצי ה-VOD');
      });

    return () => {
      active = false;
    };
  }, [channelId, loadItems]);

  const handleItem = (item: VodItem) => {
    if (item.isFolder) {
      const node = vodItemToNode(item);
      loadItems(node, [...stack, node]);
      return;
    }

    if (item.isPlayable) {
      navigation.navigate('Player', {
        title: item.episodeName || item.title || item.name,
        vodItem: item,
      });
    }
  };

  const goBack = () => {
    if (stack.length <= 1) {
      navigation.goBack();
      return;
    }

    const nextStack = stack.slice(0, -1);
    loadItems(nextStack[nextStack.length - 1], nextStack);
  };

  return (
    <View style={styles.root}>
      {/* ── HEADER ───────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Back button (left on RTL = right physically) */}
        <TVPressable
          onPress={goBack}
          style={styles.backBtn}
          hasTVPreferredFocus={false}
        >
          <Text style={styles.backText}>→ חזרה</Text>
        </TVPressable>

        {/* Channel identity */}
        <View style={styles.channelId}>
          {channelLogo ? (
            <Image source={{ uri: getAssetUrl(channelLogo) }} style={styles.channelLogo} resizeMode="contain" />
          ) : null}
          <Text style={styles.channelName}>{channelName}</Text>
        </View>
      </View>

      {/* ── CONTENT ──────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All episodes */}
        <SectionHeader title={`כל הפרקים - ${channelName}`} subtitle="לחץ על פרק לצפייה" />
        {loading ? <Text style={styles.stateText}>טוען פריטים...</Text> : null}
        {error ? <Text style={styles.stateText}>{error}</Text> : null}
        <HorizontalCarousel>
          {items.map((item) => (
            <VodItemCard
              key={item.id}
              item={item}
              onPress={handleItem}
              variant="new"
            />
          ))}
        </HorizontalCarousel>

        {/* If items split into multiple rows in the future, add more SectionRows here */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.badge,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },
  channelId: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  channelLogo: {
    width: 60,
    height: 34,
  },
  channelName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 28,
  },
  bottomPad: {
    height: 40,
  },
  stateText: {
    color: Colors.textSub,
    fontSize: 16,
    paddingHorizontal: 36,
    marginBottom: 16,
    textAlign: 'right',
  },
});
