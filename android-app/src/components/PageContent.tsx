import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type View as ViewType,
} from 'react-native';
import {
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../api/channels';
import { useMediaActions } from '../media/MediaController';
import type { MediaItem } from '../media/player';
import type { RouteDefinition } from '../navigation/routes';
import { playFocusSound } from '../platform/focusSound';
import { MediaCarousel } from './MediaCarousel';
import { RemoteImage } from './RemoteImage';

const CARD_WIDTH = 278;
const CAROUSEL_HEIGHT = 162;

interface ChannelCardProps {
  channel: MediaItem;
  itemKey: string;
  routeLabel: string;
  preferredFocus: boolean;
  onActivate: (channel: MediaItem) => void;
  onFocused: (itemKey: string, channel: MediaItem) => void;
}

const ChannelCard = memo(
  forwardRef<ViewType, ChannelCardProps>(function ChannelCardImpl(
    { channel, itemKey, routeLabel, preferredFocus, onActivate, onFocused },
    ref,
  ) {
    const [focused, setFocused] = useState(false);

    return (
      <Pressable
        ref={ref}
        accessibilityLabel={`${routeLabel}: ${channel.title}`}
        accessibilityRole="button"
        hasTVPreferredFocus={preferredFocus}
        onBlur={() => setFocused(false)}
        onFocus={() => {
          setFocused(true);
          onFocused(itemKey, channel);
        }}
        onPress={() => onActivate(channel)}
        style={[styles.card, focused && styles.focusedCard]}
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
    );
  }),
);

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
    const [channels, setChannels] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const itemRefs = useRef<Record<string, ViewType | null>>({});
    const lastFocusedItem = useRef('primary-0');
    const playbackRequestId = useRef(0);
    const { markError, play, showImage } = useMediaActions();

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
        lastFocusedItem.current = 'primary-0';
        itemRefs.current['primary-0']?.requestTVFocus?.();
      },
      restoreFocus() {
        itemRefs.current[lastFocusedItem.current]?.requestTVFocus?.();
      },
    }));

    const handleFocused = useCallback(
      (itemKey: string, channel: MediaItem) => {
        playbackRequestId.current += 1;
        lastFocusedItem.current = itemKey;
        playFocusSound();
        showImage(channel);
        onContentFocus();
      },
      [onContentFocus, showImage],
    );

    const handleActivate = useCallback(
      (channel: MediaItem) => {
        const requestId = ++playbackRequestId.current;
        resolveLiveChannelStream(channel)
          .then(stream => {
            if (playbackRequestId.current === requestId) {
              play(channel, stream);
            }
          })
          .catch(() => {
            if (playbackRequestId.current === requestId) {
              markError();
            }
          });
      },
      [markError, play],
    );

    const renderCard = useCallback(
      (channel: MediaItem, index: number, rowId: 'primary' | 'secondary') => {
        const itemKey = `${rowId}-${index}`;
        return (
          <ChannelCard
            ref={node => {
              itemRefs.current[itemKey] = node;
            }}
            channel={channel}
            itemKey={itemKey}
            routeLabel={route.label}
            preferredFocus={rowId === 'primary' && index === 0}
            onActivate={handleActivate}
            onFocused={handleFocused}
          />
        );
      },
      [handleActivate, handleFocused, route.label],
    );

    const secondaryChannels = useMemo(
      () => [...channels].reverse(),
      [channels],
    );

    return (
      <View style={styles.root}>
        {loading ? <ActivityIndicator color="#ffffff" size="large" /> : null}
        {loadFailed ? (
          <Text style={styles.error}>Live channels unavailable</Text>
        ) : null}
        {channels.length ? (
          <>
            <Text style={styles.heading}>
              {route.label} · {channels.length} live sources
            </Text>
            <MediaCarousel
              id={`${route.id}-primary`}
              items={channels}
              itemWidth={CARD_WIDTH}
              height={CAROUSEL_HEIGHT}
              preferredFocus
              keyExtractor={channel => channel.id}
              renderItem={(channel, index) =>
                renderCard(channel, index, 'primary')
              }
            />
            <Text style={[styles.heading, styles.secondaryHeading]}>
              More live channels
            </Text>
            <MediaCarousel
              id={`${route.id}-secondary`}
              items={secondaryChannels}
              itemWidth={CARD_WIDTH}
              height={CAROUSEL_HEIGHT}
              keyExtractor={channel => channel.id}
              renderItem={(channel, index) =>
                renderCard(channel, index, 'secondary')
              }
            />
          </>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 22 },
  heading: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 8,
  },
  secondaryHeading: { marginTop: 10 },
  error: { color: '#ffb4b9', fontSize: 16, height: 150 },
  card: {
    width: CARD_WIDTH,
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
