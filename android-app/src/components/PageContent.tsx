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
import { HomeScreen, type HomeScreenHandle } from '../screens/HomeScreen';

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
  const hasLogo = Boolean(channel.fallbackImageUrl);
  return (
    <View
      accessibilityLabel={`${routeLabel}: ${channel.title}`}
      style={[
        styles.cardContainer,
        { width, height },
        focused && styles.cardContainerFocused,
      ]}
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
        <View style={styles.kickerRow}>
          <View style={styles.kickerLeft}>
            {hasLogo ? (
              <View style={styles.logoBadge}>
                <RemoteImage
                  uri={channel.fallbackImageUrl!}
                  resizeMode="cover"
                  style={styles.logoBadgeImage}
                />
              </View>
            ) : null}
            <Text style={styles.cardKicker}>LIVE</Text>
          </View>
          {channel.timeRange ? (
            <Text style={styles.timeRange}>{channel.timeRange}</Text>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {channel.title}
        </Text>
        {!hasLogo ? (
          <Text numberOfLines={1} style={styles.cardCaption}>
            {channel.channelNumber ? `${channel.channelNumber}  ` : ''}
            {channel.channelName}
          </Text>
        ) : null}
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
  onItemFocused?: (item: MediaItem) => void;
}

const FallbackRouteContent = forwardRef<PageContentHandle, PageContentProps>(
  function FallbackRouteContentImpl(
    { route, active, menuFocusDestination, onContentFocus, onItemFocused },
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
              onItemFocused?.(items[0]);
            }
          }
        })
        .catch(() => mounted && setLoadFailed(true))
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
        previewEngine.clearPreview();
      };
    }, [onItemFocused, previewEngine]);

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

export const PageContent = forwardRef<PageContentHandle, PageContentProps>(
  function PageContentImpl(props, ref) {
    if (props.route.id === 'home') {
      return (
        <HomeScreen
          ref={ref as unknown as React.Ref<HomeScreenHandle>}
          route={props.route}
          active={props.active}
          menuFocusDestination={props.menuFocusDestination}
          onContentFocus={props.onContentFocus}
          onItemFocused={props.onItemFocused}
        />
      );
    }
    return <FallbackRouteContent ref={ref} {...props} />;
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
    borderRadius: 11,
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
  kickerRow: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoBadge: {
    width: 26,
    height: 26,
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
  cardKicker: {
    color: '#ff626c',
    fontSize: 11,
    fontWeight: '800',
  },
  timeRange: {
    color: '#c4d4e0',
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardCaption: { color: '#c0cbd4', fontSize: 12, marginTop: 3 },
});
