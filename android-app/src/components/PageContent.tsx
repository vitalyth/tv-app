import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  type View as ViewType,
} from 'react-native';
import {
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../api/channels';
import { useMediaController } from '../media/MediaController';
import type { MediaItem } from '../media/player';
import type { RouteDefinition } from '../navigation/routes';
import { RemoteImage } from './RemoteImage';

export interface PageContentHandle {
  focusFirst: () => void;
  restoreFocus: () => void;
}

interface PageContentProps {
  route: RouteDefinition;
  onContentFocus: () => void;
}

export const PageContent = forwardRef<PageContentHandle, PageContentProps>(
  function PageContentImpl({ route, onContentFocus }, ref) {
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [channels, setChannels] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const itemRefs = useRef<Array<ViewType | null>>([]);
    const scrollRef = useRef<ScrollView>(null);
    const lastFocusedIndex = useRef(0);
    const playbackRequestId = useRef(0);
    const media = useMediaController();
    const showImage = media.showImage;

    useEffect(() => {
      let active = true;
      getPlayableLiveChannels()
        .then(items => {
          if (active) {
            setChannels(items);
            setLoadFailed(items.length === 0);
            if (items[0]) {
              showImage(items[0]);
            }
          }
        })
        .catch(() => active && setLoadFailed(true))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
        playbackRequestId.current += 1;
      };
    }, [showImage]);

    useImperativeHandle(ref, () => ({
      focusFirst() {
        lastFocusedIndex.current = 0;
        itemRefs.current[0]?.requestTVFocus?.();
      },
      restoreFocus() {
        itemRefs.current[lastFocusedIndex.current]?.requestTVFocus?.();
      },
    }));

    return (
      <View style={styles.root}>
        <Text style={styles.heading}>
          {route.label}
          {channels.length ? `  ·  ${channels.length} live sources` : ''}
        </Text>
        {loading ? <ActivityIndicator color="#ffffff" size="large" /> : null}
        {loadFailed ? (
          <Text style={styles.error}>Live channels unavailable</Text>
        ) : null}
        <ScrollView
          horizontal
          ref={scrollRef}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.scroller}
        >
          <TVFocusGuideView autoFocus trapFocusRight style={styles.row}>
            {channels.map((channel, index) => (
              <Pressable
                key={channel.id}
                ref={node => {
                  itemRefs.current[index] = node;
                }}
                accessibilityLabel={`${route.label}: ${channel.title}`}
                accessibilityRole="button"
                hasTVPreferredFocus={index === 0}
                onBlur={() =>
                  setFocusedIndex(current =>
                    current === index ? null : current,
                  )
                }
                onFocus={() => {
                  playbackRequestId.current += 1;
                  lastFocusedIndex.current = index;
                  setFocusedIndex(index);
                  media.showImage(channel);
                  scrollRef.current?.scrollTo({
                    x: Math.max(0, index * 296 - 24),
                    animated: false,
                  });
                  onContentFocus();
                }}
                onPress={() => {
                  const requestId = ++playbackRequestId.current;
                  resolveLiveChannelStream(channel)
                    .then(stream => {
                      if (playbackRequestId.current === requestId) {
                        media.play(channel, stream);
                      }
                    })
                    .catch(() => {
                      if (playbackRequestId.current === requestId) {
                        media.markError();
                      }
                    });
                }}
                style={[
                  styles.card,
                  focusedIndex === index && styles.focusedCard,
                ]}
              >
                {channel.imageUrl ? (
                  <RemoteImage
                    uri={channel.imageUrl}
                    fallbackUri={channel.fallbackImageUrl}
                    resizeMode="cover"
                    style={styles.cardImage}
                  />
                ) : null}
                <View style={styles.cardShade} />
                <Text style={styles.cardKicker}>LIVE</Text>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {channel.title}
                </Text>
                <Text numberOfLines={1} style={styles.cardCaption}>
                  {channel.channelNumber ? `${channel.channelNumber}  ` : ''}
                  {channel.channelName}
                </Text>
              </Pressable>
            ))}
          </TVFocusGuideView>
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { marginTop: 34 },
  heading: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 14,
  },
  row: { flexDirection: 'row', gap: 18, padding: 4 },
  scroller: { marginHorizontal: -4 },
  scrollContent: { paddingHorizontal: 4, paddingVertical: 4 },
  error: { color: '#ffb4b9', fontSize: 16, height: 150 },
  card: {
    width: 278,
    height: 150,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: '#0f1f2b',
    padding: 18,
    overflow: 'hidden',
  },
  focusedCard: {
    borderColor: '#ffffff',
    backgroundColor: '#173b55',
    transform: [{ scale: 1.035 }],
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  cardShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 14, 0.5)',
  },
  cardKicker: { color: '#ff626c', fontSize: 12, fontWeight: '800' },
  cardTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '700',
    marginTop: 48,
  },
  cardCaption: { color: '#9fb0bd', fontSize: 14, marginTop: 8 },
});
