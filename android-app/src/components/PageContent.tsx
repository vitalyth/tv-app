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
  useWindowDimensions,
  StyleSheet,
  Text,
  View,
  type FocusDestination,
} from 'react-native';
import {
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../api/channels';
import { useMediaActions } from '../media/MediaController';
import { useMediaPreviewEngine } from '../media/MediaPreviewEngine';
import type { MediaItem } from '../media/player';
import type { RouteDefinition } from '../navigation/routes';
import { playFocusSound } from '../platform/focusSound';
import { MediaCarousel } from './MediaCarousel';
import type { MediaCarouselHandle } from './MediaCarousel.types';
import { RemoteImage } from './RemoteImage';
import {
  MAIN_CONTENT_INSET_LEFT,
  MAIN_CONTENT_INSET_RIGHT,
  MEDIA_CAROUSEL_ITEM_SPACING,
} from '../theme/layout';

const VISIBLE_CARD_COUNT = 4;
const CARD_ASPECT_RATIO = 16 / 9;
const FOCUS_VERTICAL_SPACE = 8;

interface ChannelCardProps {
  channel: MediaItem;
  routeLabel: string;
  width: number;
  height: number;
  focused: boolean;
}

const ChannelCard = memo(function ChannelCardView({
  channel,
  routeLabel,
  width,
  height,
  focused,
}: ChannelCardProps) {
  return (
    <View
      accessibilityLabel={`${routeLabel}: ${channel.title}`}
      style={[styles.cardContainer, { width, height }]}
    >
      <View style={styles.cardSurface}>
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
      </View>
      {focused ? (
        <View pointerEvents="none" style={styles.focusBorder} />
      ) : null}
    </View>
  );
});

export interface PageContentHandle {
  canExitToMenu: () => boolean;
  focusFirst: () => void;
  restoreFocus: () => void;
}

interface PageContentProps {
  route: RouteDefinition;
  active: boolean;
  menuFocusDestination: FocusDestination;
  onContentFocus: () => void;
}

export const PageContent = forwardRef<PageContentHandle, PageContentProps>(
  function PageContentImpl(
    { route, active, menuFocusDestination, onContentFocus },
    ref,
  ) {
    const [channels, setChannels] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const { width: windowWidth } = useWindowDimensions();
    const primaryCarouselRef = useRef<MediaCarouselHandle>(null);
    const secondaryCarouselRef = useRef<MediaCarouselHandle>(null);
    const lastFocusedRowRef = useRef<'primary' | 'secondary'>('primary');
    const [focusedRow, setFocusedRow] = useState<'primary' | 'secondary'>(
      'primary',
    );
    const { markError, play } = useMediaActions();
    const previewEngine = useMediaPreviewEngine();

    const contentWidth =
      windowWidth - MAIN_CONTENT_INSET_LEFT - MAIN_CONTENT_INSET_RIGHT;
    const cardWidth = Math.floor(
      (contentWidth - MEDIA_CAROUSEL_ITEM_SPACING * (VISIBLE_CARD_COUNT - 1)) /
        VISIBLE_CARD_COUNT,
    );
    const cardHeight = Math.round(cardWidth / CARD_ASPECT_RATIO);
    const carouselHeight = cardHeight + FOCUS_VERTICAL_SPACE;

    useEffect(() => {
      let mounted = true;
      getPlayableLiveChannels()
        .then(items => {
          if (mounted) {
            setChannels(items);
            setLoadFailed(items.length === 0);
            if (items[0]) {
              previewEngine.focusMediaItem(items[0]);
            }
          }
        })
        .catch(() => mounted && setLoadFailed(true))
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
        previewEngine.clearPreview();
      };
    }, [previewEngine]);

    useImperativeHandle(ref, () => ({
      canExitToMenu() {
        const target =
          lastFocusedRowRef.current === 'primary'
            ? primaryCarouselRef
            : secondaryCarouselRef;
        return target.current?.getSelectedIndex() === 0;
      },
      focusFirst() {
        lastFocusedRowRef.current = 'primary';
        setFocusedRow('primary');
        primaryCarouselRef.current?.focusIndex(0);
      },
      restoreFocus() {
        const target =
          lastFocusedRowRef.current === 'primary'
            ? primaryCarouselRef
            : secondaryCarouselRef;
        target.current?.restoreFocus();
      },
    }));

    const handleFocused = useCallback(
      (row: 'primary' | 'secondary', channel: MediaItem) => {
        lastFocusedRowRef.current = row;
        setFocusedRow(current => (current === row ? current : row));
        playFocusSound();
        previewEngine.focusMediaItem(channel);
        onContentFocus();
      },
      [onContentFocus, previewEngine],
    );

    const handleActivate = useCallback(
      (channel: MediaItem) => {
        resolveLiveChannelStream(channel)
          .then(stream => {
            play(channel, stream);
          })
          .catch(() => {
            markError();
          });
      },
      [markError, play],
    );

    const secondaryChannels = useMemo(
      () => [...channels].reverse(),
      [channels],
    );

    const renderChannelCard = useCallback(
      (channel: MediaItem, _index: number, focused: boolean) => (
        <ChannelCard
          channel={channel}
          routeLabel={route.label}
          width={cardWidth}
          height={cardHeight}
          focused={focused}
        />
      ),
      [cardHeight, cardWidth, route.label],
    );

    const handlePrimaryFocus = useCallback(
      (channel: MediaItem) => handleFocused('primary', channel),
      [handleFocused],
    );

    const handleSecondaryFocus = useCallback(
      (channel: MediaItem) => handleFocused('secondary', channel),
      [handleFocused],
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
              ref={primaryCarouselRef}
              items={channels}
              itemWidth={cardWidth}
              height={carouselHeight}
              leadingInset={MAIN_CONTENT_INSET_LEFT}
              trailingInset={MAIN_CONTENT_INSET_RIGHT}
              active={active && focusedRow === 'primary'}
              preferredFocus
              trapFocusUp
              leftFocusDestination={menuFocusDestination}
              keyExtractor={channel => channel.id}
              renderItem={renderChannelCard}
              onItemFocus={handlePrimaryFocus}
              onItemSelect={handleActivate}
            />
            <Text style={[styles.heading, styles.secondaryHeading]}>
              More live channels
            </Text>
            <MediaCarousel
              id={`${route.id}-secondary`}
              ref={secondaryCarouselRef}
              items={secondaryChannels}
              itemWidth={cardWidth}
              height={carouselHeight}
              leadingInset={MAIN_CONTENT_INSET_LEFT}
              trailingInset={MAIN_CONTENT_INSET_RIGHT}
              active={active && focusedRow === 'secondary'}
              trapFocusDown
              leftFocusDestination={menuFocusDestination}
              keyExtractor={channel => channel.id}
              renderItem={renderChannelCard}
              onItemFocus={handleSecondaryFocus}
              onItemSelect={handleActivate}
            />
          </>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 22, overflow: 'visible' },
  heading: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 8,
  },
  secondaryHeading: { marginTop: 10 },
  error: { color: '#ffb4b9', fontSize: 16, height: 150 },
  cardContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  cardSurface: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: '#0f1f2b',
    padding: 12,
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
    borderRadius: 9,
    borderWidth: 3,
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
  cardKicker: {
    position: 'absolute',
    top: 10,
    left: 12,
    color: '#ff626c',
    fontSize: 11,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardCaption: { color: '#c0cbd4', fontSize: 12, marginTop: 3 },
});
