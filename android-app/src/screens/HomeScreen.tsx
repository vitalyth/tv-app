import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type FocusDestination,
  type LayoutChangeEvent,
} from 'react-native';
import {
  getDistinctLiveChannels,
  mergeLiveChannelsPreservingOrder,
  refreshMediaItemEpg,
  resolveLiveChannelStream,
} from '../api/channels';
import { getRecentVodItems, resolveVodStream } from '../api/vod';
import { t } from '../i18n';
import {
  WatchProgressService,
  type ContinueWatchingItem,
} from '../services/watchProgress';
import { RecentChannelsService } from '../services/recentChannels';
import { useMediaActions } from '../media/MediaController';
import { useMediaPreviewEngine } from '../media/MediaPreviewEngine';
import type { MediaItem, MediaStream } from '../media/player';
import type { RouteDefinition } from '../navigation/routes';
import { playFocusSound } from '../platform/focusSound';
import { MediaCarousel } from '../components/MediaCarousel';
import type { MediaCarouselHandle } from '../components/MediaCarousel.types';
import { LiveChannelCard } from '../components/cards/LiveChannelCard';
import { VodCard } from '../components/cards/VodCard';
import { ContinueWatchingCard } from '../components/cards/ContinueWatchingCard';
import { SkeletonRows } from '../components/SkeletonRows';
import {
  MAIN_CONTENT_INSET_LEFT,
  MAIN_CONTENT_INSET_RIGHT,
  MEDIA_CAROUSEL_ITEM_SPACING,
} from '../theme/layout';

const VISIBLE_CARD_COUNT = 4;
const CARD_ASPECT_RATIO = 16 / 9;
const FOCUS_VERTICAL_SPACE = 8;

export interface HomeScreenHandle {
  canExitToMenu: () => boolean;
  focusFirst: () => void;
  restoreFocus: () => void;
}

interface HomeScreenProps {
  route: RouteDefinition;
  active: boolean;
  menuFocusDestination: FocusDestination;
  onContentFocus: () => void;
  onItemFocused?: (item: MediaItem) => void;
}

type RowKey = 'continue' | 'live' | 'vod';

export function prioritizeLiveChannels(
  channels: MediaItem[],
  recentChannelIds: string[],
): MediaItem[] {
  if (recentChannelIds.length === 0) {
    return channels;
  }
  const channelMap = new Map<string, MediaItem>();
  for (const ch of channels) {
    channelMap.set(ch.id, ch);
  }

  const prioritized: MediaItem[] = [];
  const seenIds = new Set<string>();

  for (const id of recentChannelIds) {
    const found = channelMap.get(id);
    if (found && !seenIds.has(id)) {
      prioritized.push(found);
      seenIds.add(id);
    }
  }

  for (const ch of channels) {
    if (!seenIds.has(ch.id)) {
      prioritized.push(ch);
    }
  }

  return prioritized;
}

export const HomeScreen = forwardRef<HomeScreenHandle, HomeScreenProps>(
  function HomeScreenImpl(
    { route, active, menuFocusDestination, onContentFocus, onItemFocused },
    ref,
  ) {
    const [liveChannels, setLiveChannels] = useState<MediaItem[]>([]);
    const [vodItems, setVodItems] = useState<MediaItem[]>([]);
    const [continueItems, setContinueItems] = useState<ContinueWatchingItem[]>(
      [],
    );
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [contentReady, setContentReady] = useState(false);
    const skeletonOpacity = useRef(new Animated.Value(1)).current;
    const contentOpacity = useRef(new Animated.Value(0)).current;
    const [loadFailed, setLoadFailed] = useState(false);
    const currentlyFocusedItemRef = useRef<MediaItem | undefined>(undefined);

    const { width: windowWidth } = useWindowDimensions();
    const continueCarouselRef = useRef<MediaCarouselHandle>(null);
    const liveCarouselRef = useRef<MediaCarouselHandle>(null);
    const vodCarouselRef = useRef<MediaCarouselHandle>(null);

    const lastFocusedRowRef = useRef<RowKey>('live');
    const [focusedRow, setFocusedRow] = useState<RowKey>('live');

    const { play, markError } = useMediaActions();

    // Unified stream resolver supporting live and vod media items
    const streamResolver = useCallback(
      async (item: MediaItem): Promise<MediaStream> => {
        if (item.kind === 'vod') {
          return resolveVodStream(item);
        }
        return resolveLiveChannelStream(item);
      },
      [],
    );

    const previewEngine = useMediaPreviewEngine({ streamResolver });
    const previewEngineRef = useRef(previewEngine);
    previewEngineRef.current = previewEngine;
    const onItemFocusedRef = useRef(onItemFocused);
    onItemFocusedRef.current = onItemFocused;

    const contentWidth =
      windowWidth - MAIN_CONTENT_INSET_LEFT - MAIN_CONTENT_INSET_RIGHT;
    const cardWidth = Math.floor(
      (contentWidth - MEDIA_CAROUSEL_ITEM_SPACING * (VISIBLE_CARD_COUNT - 1)) /
        VISIBLE_CARD_COUNT,
    );
    const cardHeight = Math.round(cardWidth / CARD_ASPECT_RATIO);
    const carouselHeight = cardHeight + FOCUS_VERTICAL_SPACE;

    const hasContinue = continueItems.length > 0;
    const hasLive = liveChannels.length > 0;
    const hasVod = vodItems.length > 0;

    const translateYAnim = useRef(new Animated.Value(0)).current;
    const continueOpacityAnim = useRef(new Animated.Value(1)).current;
    const liveOpacityAnim = useRef(new Animated.Value(1)).current;
    const vodOpacityAnim = useRef(new Animated.Value(1)).current;
    const rowOffsets = useRef<Record<string, number>>({});

    const onRowLayout = useCallback(
      (rowKey: string) => (e: LayoutChangeEvent) => {
        rowOffsets.current[rowKey] = e.nativeEvent.layout.y;
      },
      [],
    );

    useEffect(() => {
      let targetY = 0;
      let continueOpacity = 1;
      let liveOpacity = 1;
      let vodOpacity = 1;

      if (focusedRow === 'vod') {
        const vodOffset = rowOffsets.current.vod ?? (cardHeight + 56);
        targetY = -vodOffset;
        continueOpacity = 0;
        liveOpacity = 0;
        vodOpacity = 1;
      } else if (focusedRow === 'live') {
        if (hasContinue) {
          const liveOffset = rowOffsets.current.live ?? (cardHeight + 56);
          targetY = -liveOffset;
          continueOpacity = 0;
          liveOpacity = 1;
          vodOpacity = 1;
        } else {
          targetY = 0;
          continueOpacity = 1;
          liveOpacity = 1;
          vodOpacity = 1;
        }
      } else {
        targetY = 0;
        continueOpacity = 1;
        liveOpacity = 1;
        vodOpacity = 1;
      }

      Animated.parallel([
        Animated.timing(translateYAnim, {
          toValue: targetY,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(continueOpacityAnim, {
          toValue: continueOpacity,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(liveOpacityAnim, {
          toValue: liveOpacity,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(vodOpacityAnim, {
          toValue: vodOpacity,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }, [
      cardHeight,
      continueOpacityAnim,
      focusedRow,
      hasContinue,
      liveOpacityAnim,
      translateYAnim,
      vodOpacityAnim,
    ]);

    const continueWatchingMediaItems = useMemo<MediaItem[]>(
      () =>
        continueItems.map(item => ({
          id: item.id,
          kind: 'vod',
          title: item.title,
          channelName: item.seriesTitle ?? item.channelName ?? undefined,
          imageUrl: item.imageUrl ?? undefined,
          backdropUrl: item.backdropUrl ?? item.imageUrl ?? undefined,
          progressPercentage: item.progressPercentage,
          sourcePayload: item.sourcePayload ?? {
            episodeId: item.episodeId,
            streamUrl: item.streamUrl,
          },
        })),
      [continueItems],
    );

    useEffect(() => {
      let mounted = true;

      Promise.allSettled([
        WatchProgressService.getContinueWatching(),
        getDistinctLiveChannels({ requireEpg: true }),
        getRecentVodItems(),
        RecentChannelsService.getRecentChannelIds(),
      ])
        .then(([continueRes, liveRes, vodRes, recentRes]) => {
          if (!mounted) {
            return;
          }

          const resolvedContinue =
            continueRes.status === 'fulfilled' ? continueRes.value : [];
          const resolvedLiveRaw =
            liveRes.status === 'fulfilled' ? liveRes.value : [];
          const resolvedVod = vodRes.status === 'fulfilled' ? vodRes.value : [];
          const recentChannelIds =
            recentRes.status === 'fulfilled' ? recentRes.value : [];

          const resolvedLive = prioritizeLiveChannels(
            resolvedLiveRaw,
            recentChannelIds,
          );

          setContinueItems(resolvedContinue);
          setLiveChannels(resolvedLive);
          setVodItems(resolvedVod);

          const hasData =
            resolvedContinue.length > 0 ||
            resolvedLive.length > 0 ||
            resolvedVod.length > 0;
          setLoadFailed(!hasData);

          // Initial focus determination
          const initialRow: RowKey =
            resolvedContinue.length > 0 ? 'continue' : 'live';
          lastFocusedRowRef.current = initialRow;
          setFocusedRow(initialRow);

          let firstItem: MediaItem | undefined;
          if (resolvedContinue.length > 0 && resolvedContinue[0]) {
            const c = resolvedContinue[0];
            firstItem = {
              id: c.id,
              kind: 'vod',
              title: c.title,
              channelName: c.seriesTitle ?? c.channelName ?? undefined,
              imageUrl: c.imageUrl ?? undefined,
              backdropUrl: c.backdropUrl ?? c.imageUrl ?? undefined,
              progressPercentage: c.progressPercentage,
              sourcePayload: c.sourcePayload ?? {
                episodeId: c.episodeId,
                streamUrl: c.streamUrl,
              },
            };
          } else {
            firstItem = resolvedLive[0] ?? resolvedVod[0];
          }

          currentlyFocusedItemRef.current = firstItem;

          if (firstItem) {
            previewEngineRef.current.focusMediaItem(firstItem);
            onItemFocusedRef.current?.(firstItem);
          }

          Animated.timing(skeletonOpacity, {
            toValue: 0,
            duration: 250,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start(() => {
            if (!mounted) {
              return;
            }
            setShowSkeleton(false);
            setContentReady(true);
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 250,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }).start();

            setTimeout(() => {
              if (!mounted) {
                return;
              }
              const targetCarousel =
                initialRow === 'continue'
                  ? continueCarouselRef
                  : liveCarouselRef;
              targetCarousel.current?.focusIndex(0);
            }, 60);
          });
        })
        .catch(() => {
          if (!mounted) {
            return;
          }
          setLoadFailed(true);
          setShowSkeleton(false);
        });

      return () => {
        mounted = false;
        previewEngineRef.current.clearPreview();
      };
    }, [contentOpacity, skeletonOpacity]);

    // Periodic EPG progress & program recalculation without altering ordering
    useEffect(() => {
      if (!contentReady || !active) {
        return;
      }
      const localInterval = setInterval(() => {
        setLiveChannels(prev => {
          const updated = prev.map(refreshMediaItemEpg);
          if (currentlyFocusedItemRef.current?.kind === 'live') {
            const currentId = currentlyFocusedItemRef.current.id;
            const updatedFocused = updated.find(c => c.id === currentId);
            if (
              updatedFocused &&
              (updatedFocused.title !== currentlyFocusedItemRef.current.title ||
                updatedFocused.timeRange !==
                  currentlyFocusedItemRef.current.timeRange ||
                updatedFocused.progressPercentage !==
                  currentlyFocusedItemRef.current.progressPercentage)
            ) {
              currentlyFocusedItemRef.current = updatedFocused;
              onItemFocusedRef.current?.(updatedFocused);
              previewEngineRef.current.focusMediaItem(updatedFocused);
            }
          }
          return updated;
        });
      }, 30_000);

      const remoteInterval = setInterval(() => {
        getDistinctLiveChannels({ requireEpg: true })
          .then(fresh => {
            setLiveChannels(prev => {
              const merged = mergeLiveChannelsPreservingOrder(prev, fresh);
              if (currentlyFocusedItemRef.current?.kind === 'live') {
                const currentId = currentlyFocusedItemRef.current.id;
                const updatedFocused = merged.find(c => c.id === currentId);
                if (
                  updatedFocused &&
                  (updatedFocused.title !==
                    currentlyFocusedItemRef.current.title ||
                    updatedFocused.timeRange !==
                      currentlyFocusedItemRef.current.timeRange)
                ) {
                  currentlyFocusedItemRef.current = updatedFocused;
                  onItemFocusedRef.current?.(updatedFocused);
                  previewEngineRef.current.focusMediaItem(updatedFocused);
                }
              }
              return merged;
            });
          })
          .catch(() => {});
      }, 180_000);

      (localInterval as unknown as { unref?: () => void }).unref?.();
      (remoteInterval as unknown as { unref?: () => void }).unref?.();

      return () => {
        clearInterval(localInterval);
        clearInterval(remoteInterval);
      };
    }, [active, contentReady]);

    const getActiveCarousel = useCallback(() => {
      switch (lastFocusedRowRef.current) {
        case 'continue':
          return continueCarouselRef;
        case 'live':
          return liveCarouselRef;
        case 'vod':
          return vodCarouselRef;
        default:
          return liveCarouselRef;
      }
    }, []);

    useImperativeHandle(ref, () => ({
      canExitToMenu() {
        return getActiveCarousel().current?.getSelectedIndex() === 0;
      },
      focusFirst() {
        const targetRow: RowKey =
          continueItems.length > 0 ? 'continue' : 'live';
        lastFocusedRowRef.current = targetRow;
        setFocusedRow(targetRow);
        const targetCarousel =
          targetRow === 'continue' ? continueCarouselRef : liveCarouselRef;
        targetCarousel.current?.focusIndex(0);
      },
      restoreFocus() {
        getActiveCarousel().current?.restoreFocus();
      },
    }));

    const handleFocused = useCallback(
      (row: RowKey, item: MediaItem) => {
        lastFocusedRowRef.current = row;
        setFocusedRow(current => (current === row ? current : row));
        currentlyFocusedItemRef.current = item;
        playFocusSound();
        previewEngineRef.current.focusMediaItem(item);
        onItemFocusedRef.current?.(item);
        onContentFocus();
      },
      [onContentFocus],
    );

    const handleContinueFocus = useCallback(
      (item: MediaItem) => handleFocused('continue', item),
      [handleFocused],
    );
    const handleLiveFocus = useCallback(
      (item: MediaItem) => handleFocused('live', item),
      [handleFocused],
    );
    const handleVodFocus = useCallback(
      (item: MediaItem) => handleFocused('vod', item),
      [handleFocused],
    );

    const handleActivate = useCallback(
      (item: MediaItem) => {
        if (item.kind === 'live') {
          RecentChannelsService.recordChannelWatched(item.id).catch(() => {});
        }
        streamResolver(item)
          .then(stream => {
            play(item, stream);
          })
          .catch(() => {
            markError();
          });
      },
      [markError, play, streamResolver],
    );

    const renderContinueCard = useCallback(
      (_item: MediaItem, index: number, focused: boolean) => {
        const continueItem = continueItems[index];
        if (!continueItem) {
          return <View style={{ width: cardWidth, height: cardHeight }} />;
        }
        return (
          <ContinueWatchingCard
            item={continueItem}
            width={cardWidth}
            height={cardHeight}
            focused={focused}
          />
        );
      },
      [cardHeight, cardWidth, continueItems],
    );

    const renderLiveCard = useCallback(
      (channel: MediaItem, _index: number, focused: boolean) => (
        <LiveChannelCard
          channel={channel}
          width={cardWidth}
          height={cardHeight}
          focused={focused}
        />
      ),
      [cardHeight, cardWidth],
    );

    const renderVodCard = useCallback(
      (item: MediaItem, _index: number, focused: boolean) => (
        <VodCard
          item={item}
          width={cardWidth}
          height={cardHeight}
          focused={focused}
        />
      ),
      [cardHeight, cardWidth],
    );

    return (
      <View style={styles.root}>
        {loadFailed ? (
          <Text style={styles.error}>{t('homeContentUnavailable')}</Text>
        ) : null}

        {showSkeleton ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.skeletonContainer,
              { opacity: skeletonOpacity },
            ]}
          >
            <SkeletonRows cardWidth={cardWidth} cardHeight={cardHeight} />
          </Animated.View>
        ) : null}

        {contentReady ? (
          <Animated.View
            style={[
              styles.rowsContainer,
              {
                opacity: contentOpacity,
                transform: [{ translateY: translateYAnim }],
              },
            ]}
          >
          {/* שורה 1: המשך צפייה (מוסתרת כשרעיונית אין פריטים) */}
          {hasContinue ? (
            <Animated.View
              onLayout={onRowLayout('continue')}
              style={[styles.row, { opacity: continueOpacityAnim }]}
            >
              <Text style={styles.heading}>
                {t('continueWatchingHeading', { count: continueItems.length })}
              </Text>
              <MediaCarousel
                id={`${route.id}-continue`}
                ref={continueCarouselRef}
                items={continueWatchingMediaItems}
                itemWidth={cardWidth}
                height={carouselHeight}
                leadingInset={MAIN_CONTENT_INSET_LEFT}
                trailingInset={MAIN_CONTENT_INSET_RIGHT}
                active={active && focusedRow === 'continue'}
                preferredFocus
                trapFocusUp
                trapFocusDown={!hasLive && !hasVod}
                leftFocusDestination={menuFocusDestination}
                keyExtractor={item => item.id}
                renderItem={renderContinueCard}
                onItemFocus={handleContinueFocus}
                onItemSelect={handleActivate}
              />
            </Animated.View>
          ) : null}

          {/* שורה 2: משודר עכשיו בלייב */}
          {hasLive ? (
            <Animated.View
              onLayout={onRowLayout('live')}
              style={[styles.row, { opacity: liveOpacityAnim }]}
            >
              <Text
                style={[
                  styles.heading,
                  hasContinue && styles.secondaryHeading,
                ]}
              >
                {t('nowOnLiveTvHeading', { count: liveChannels.length })}
              </Text>
              <MediaCarousel
                id={`${route.id}-live`}
                ref={liveCarouselRef}
                items={liveChannels}
                itemWidth={cardWidth}
                height={carouselHeight}
                leadingInset={MAIN_CONTENT_INSET_LEFT}
                trailingInset={MAIN_CONTENT_INSET_RIGHT}
                active={active && focusedRow === 'live'}
                preferredFocus={!hasContinue}
                trapFocusUp={!hasContinue}
                trapFocusDown={!hasVod}
                leftFocusDestination={menuFocusDestination}
                keyExtractor={item => item.id}
                renderItem={renderLiveCard}
                onItemFocus={handleLiveFocus}
                onItemSelect={handleActivate}
              />
            </Animated.View>
          ) : null}

          {/* שורה 3: חדש ב-VOD */}
          {hasVod ? (
            <Animated.View
              onLayout={onRowLayout('vod')}
              style={[styles.row, { opacity: vodOpacityAnim }]}
            >
              <Text
                style={[
                  styles.heading,
                  (hasContinue || hasLive) && styles.secondaryHeading,
                ]}
              >
                {t('newOnVodHeading', { count: vodItems.length })}
              </Text>
              <MediaCarousel
                id={`${route.id}-vod`}
                ref={vodCarouselRef}
                items={vodItems}
                itemWidth={cardWidth}
                height={carouselHeight}
                leadingInset={MAIN_CONTENT_INSET_LEFT}
                trailingInset={MAIN_CONTENT_INSET_RIGHT}
                active={active && focusedRow === 'vod'}
                trapFocusDown
                leftFocusDestination={menuFocusDestination}
                keyExtractor={item => item.id}
                renderItem={renderVodCard}
                onItemFocus={handleVodFocus}
                onItemSelect={handleActivate}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 22, overflow: 'visible', position: 'relative' },
  skeletonContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  rowsContainer: { flex: 1, overflow: 'visible' },
  row: { overflow: 'visible' },
  heading: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 8,
  },
  secondaryHeading: { marginTop: 10 },
  error: { color: '#ffb4b9', fontSize: 16, height: 150 },
});

