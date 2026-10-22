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
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type FocusDestination,
} from 'react-native';
import { getRecentVodItems, resolveVodStream } from '../api/vod';
import {
  getVodCatalog,
  getVodSeriesDetails,
  vodEpisodeMediaItem,
  vodSeriesMediaItem,
  VOD_PROVIDERS,
  type VodCatalogPage,
  type VodProviderId,
  type VodSeries,
  type VodSeriesDetails,
} from '../api/vodCatalog';
import type { PageContentHandle } from '../components/PageContent';
import { MediaCarousel } from '../components/MediaCarousel';
import type { MediaCarouselHandle } from '../components/MediaCarousel.types';
import { VodCard } from '../components/cards/VodCard';
import { useMediaActions, useMediaController } from '../media/MediaController';
import { useMediaPreviewEngine } from '../media/MediaPreviewEngine';
import type { MediaItem } from '../media/player';
import { WatchProgressService } from '../services/watchProgress';
import { playFocusSound } from '../platform/focusSound';
import {
  MAIN_CONTENT_INSET_LEFT,
  MAIN_CONTENT_INSET_RIGHT,
  MEDIA_CAROUSEL_ITEM_SPACING,
} from '../theme/layout';
import { t } from '../i18n';

interface VodScreenProps {
  active: boolean;
  menuFocusDestination: FocusDestination;
  onContentFocus: () => void;
  onItemFocused?: (item: MediaItem) => void;
}
type CatalogTab = VodProviderId | 'recent' | 'history';

function CatalogButton({
  label,
  selected = false,
  disabled = false,
  onPress,
  onFocus,
  testID,
  icon,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  testID: string;
  icon?: 'close';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      style={[
        styles.button,
        selected && styles.selectedButton,
        focused && styles.focusedButton,
        disabled && styles.disabledButton,
      ]}
    >
      {icon ? (
        <Image
          source={require('../assets/icons/close.png')}
          style={styles.icon}
        />
      ) : (
        <Text numberOfLines={1} style={styles.buttonText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const PAGE_SIZE = 40;
export const VodScreen = forwardRef<PageContentHandle, VodScreenProps>(
  function VodScreenView(
    { active, menuFocusDestination, onContentFocus, onItemFocused },
    ref,
  ) {
    const [tab, setTab] = useState<CatalogTab>('kan');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState('');
    const [category, setCategory] = useState('');
    const [offset, setOffset] = useState(0);
    const [page, setPage] = useState<VodCatalogPage | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<VodSeries | null>(
      null,
    );
    const [details, setDetails] = useState<VodSeriesDetails | null>(null);
    const [season, setSeason] = useState('');
    const [episodePage, setEpisodePage] = useState(0);
    const [episodes, setEpisodes] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [zone, setZone] = useState({ name: 'items', index: 0 });
    const carouselRef = useRef<MediaCarouselHandle>(null);
    const lastFocusedId = useRef<string | undefined>(undefined);
    const catalogFocusedId = useRef<string | undefined>(undefined);
    const focusAfterLoad = useRef(true);
    const activationRequest = useRef(0);
    const {
      item: playingItem,
      stream,
      isFullscreen,
      seekTo,
    } = useMediaController();
    const { openFullscreen } = useMediaActions();
    const wasFullscreen = useRef(isFullscreen);
    const provider = VOD_PROVIDERS.some(item => item.id === tab)
      ? (tab as VodProviderId)
      : null;
    const preview = useMediaPreviewEngine({
      streamResolver: resolveVodStream,
      videoPreviewEnabled: Boolean(details) || !provider,
    });
    const latest = useRef({
      preview,
      onItemFocused,
      onContentFocus,
      provider,
      details,
      isFullscreen,
      active,
      playingItem,
      stream,
      openFullscreen,
      seekTo,
    });
    latest.current = {
      preview,
      onItemFocused,
      onContentFocus,
      provider,
      details,
      isFullscreen,
      active,
      playingItem,
      stream,
      openFullscreen,
      seekTo,
    };
    const { width } = useWindowDimensions();
    const cardWidth = Math.floor(
      (width -
        MAIN_CONTENT_INSET_LEFT -
        MAIN_CONTENT_INSET_RIGHT -
        MEDIA_CAROUSEL_ITEM_SPACING * 3) /
        4,
    );
    const cardHeight = Math.round((cardWidth * 9) / 16);

    useEffect(
      () => () => {
        activationRequest.current += 1;
        latest.current.preview.clearPreview();
      },
      [],
    );

    useEffect(() => {
      const returnedFromPlayer = wasFullscreen.current && !isFullscreen;
      wasFullscreen.current = isFullscreen;
      if (returnedFromPlayer && tab === 'history') {
        setRetry(value => value + 1);
      }
    }, [isFullscreen, tab]);

    useEffect(() => {
      if (selectedSeries) {
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(false);
      setPage(null);
      setEpisodes([]);
      const load = async () => {
        if (provider) {
          const result = await getVodCatalog(provider, {
            query,
            category,
            offset,
          });
          if (!cancelled) {
            setPage(result);
          }
        } else if (tab === 'recent') {
          const result = await getRecentVodItems();
          if (!cancelled) {
            setEpisodes(result);
          }
        } else {
          const history = await WatchProgressService.getContinueWatching();
          if (!cancelled) {
            setEpisodes(
              history.map(saved => ({
                id: `vod-${saved.episodeId}`,
                kind: 'vod',
                title: saved.title,
                programName: saved.seriesTitle ?? undefined,
                channelName: saved.channelName ?? undefined,
                imageUrl: saved.imageUrl ?? undefined,
                backdropUrl: saved.backdropUrl ?? undefined,
                resumePositionMs: saved.positionMs,
                progressPercentage: saved.progressPercentage,
                sourcePayload: saved.sourcePayload ?? {
                  episodeId: saved.episodeId,
                  streamUrl: saved.streamUrl,
                },
              })),
            );
          }
        }
      };
      load()
        .catch(() => {
          if (!cancelled) {
            setError(true);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [tab, provider, query, category, offset, retry, selectedSeries]);

    useEffect(() => {
      if (!selectedSeries || !provider) {
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(false);
      setDetails(null);
      getVodSeriesDetails(provider, selectedSeries.id)
        .then(result => {
          if (!cancelled) {
            setDetails(result);
            setSeason('');
            setEpisodePage(0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [provider, selectedSeries, retry]);

    const mediaItems = useMemo(() => {
      if (selectedSeries) {
        return details && provider
          ? details.episodes
              .filter(episode => !season || episode.season_id === season)
              .map(episode => vodEpisodeMediaItem(episode, details, provider))
          : [];
      }
      if (provider) {
        return (
          page?.series.map(series => vodSeriesMediaItem(series, provider)) ?? []
        );
      }
      const normalized = query.trim().toLocaleLowerCase();
      return episodes.filter(
        item =>
          !normalized ||
          `${item.programName ?? ''} ${item.title}`
            .toLocaleLowerCase()
            .includes(normalized),
      );
    }, [details, episodes, page, provider, query, season, selectedSeries]);
    const localPaging = Boolean(selectedSeries) || !provider;
    const displayedItems = useMemo(
      () =>
        localPaging
          ? mediaItems.slice(
              episodePage * PAGE_SIZE,
              (episodePage + 1) * PAGE_SIZE,
            )
          : mediaItems,
      [episodePage, localPaging, mediaItems],
    );
    const viewKey = `${tab}-${
      selectedSeries?.id ?? 'catalog'
    }-${category}-${query}-${offset}-${season}-${episodePage}`;

    const focusPreview = useCallback((item: MediaItem) => {
      if (!latest.current.active || latest.current.isFullscreen) {
        return;
      }
      lastFocusedId.current = item.id;
      latest.current.preview.focusMediaItem(item);
      latest.current.onItemFocused?.(item);
    }, []);

    useEffect(() => {
      activationRequest.current += 1;
      if (!active) {
        latest.current.preview.clearPreview({ stopMedia: false });
      }
    }, [active, viewKey]);

    useEffect(() => {
      if (!loading && displayedItems[0]) {
        const selected =
          displayedItems.find(item => item.id === lastFocusedId.current) ??
          displayedItems[0];
        focusPreview(selected);
        if (focusAfterLoad.current && active && !isFullscreen) {
          focusAfterLoad.current = false;
          setZone({ name: 'items', index: displayedItems.indexOf(selected) });
          const timer = setTimeout(() => {
            if (latest.current.active && !latest.current.isFullscreen) {
              carouselRef.current?.focusIndex(displayedItems.indexOf(selected));
            }
          }, 160);
          return () => clearTimeout(timer);
        }
      }
    }, [active, displayedItems, focusPreview, isFullscreen, loading]);

    const backToCatalog = useCallback(() => {
      activationRequest.current += 1;
      latest.current.preview.clearPreview();
      lastFocusedId.current = catalogFocusedId.current;
      focusAfterLoad.current = true;
      setSelectedSeries(null);
      setDetails(null);
      setEpisodePage(0);
      setZone({ name: 'items', index: 0 });
    }, []);

    useEffect(() => {
      if (!active || isFullscreen || !selectedSeries) {
        return;
      }
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          backToCatalog();
          return true;
        },
      );
      return () => subscription.remove();
    }, [active, backToCatalog, isFullscreen, selectedSeries]);

    useImperativeHandle(
      ref,
      () => ({
        canExitToMenu: () => !isFullscreen && zone.index === 0,
        focusFirst: () => carouselRef.current?.focusIndex(0),
        restoreFocus: itemId => {
          const index = displayedItems.findIndex(
            item => item.id === (itemId ?? lastFocusedId.current),
          );
          if (index >= 0) {
            carouselRef.current?.focusIndex(index);
          } else {
            carouselRef.current?.restoreFocus();
          }
        },
      }),
      [displayedItems, isFullscreen, zone.index],
    );

    // Vega may retain native item callbacks, so read the latest navigation and playback state.
    const selection = useRef({
      selectedSeries,
      page,
      provider,
      displayedItems,
    });
    selection.current = { selectedSeries, page, provider, displayedItems };
    const handleSelect = useCallback(async (item: MediaItem) => {
      if (!latest.current.active || latest.current.isFullscreen) {
        return;
      }
      const state = selection.current;
      if (!state.displayedItems.some(candidate => candidate.id === item.id)) {
        return;
      }
      const request = ++activationRequest.current;
      latest.current.preview.clearPreview({ stopMedia: false });
      if (!state.selectedSeries && state.provider) {
        const series = state.page?.series.find(
          candidate => `series-${state.provider}-${candidate.id}` === item.id,
        );
        if (series) {
          catalogFocusedId.current = item.id;
          focusAfterLoad.current = true;
          setSelectedSeries(series);
          setDetails(null);
        }
        return;
      }
      try {
        const payload = item.sourcePayload as
          | { episodeId?: string; id?: string }
          | undefined;
        const progress = await WatchProgressService.getProgress(
          payload?.episodeId || payload?.id || item.id.replace(/^vod-/, ''),
        );
        if (
          request !== activationRequest.current ||
          !latest.current.active ||
          latest.current.isFullscreen
        ) {
          return;
        }
        const playable = progress
          ? { ...item, resumePositionMs: progress.positionMs }
          : item;
        const current = latest.current;
        const reuse = current.playingItem?.id === item.id && current.stream;
        current.openFullscreen(playable);
        if (reuse && playable.resumePositionMs) {
          current.seekTo(playable.resumePositionMs / 1000);
        }
      } catch {
        if (
          request === activationRequest.current &&
          latest.current.active &&
          !latest.current.isFullscreen
        ) {
          latest.current.openFullscreen(item);
        }
      }
    }, []);

    const changeTab = (next: CatalogTab) => {
      activationRequest.current += 1;
      latest.current.preview.clearPreview();
      focusAfterLoad.current = true;
      lastFocusedId.current = undefined;
      setTab(next);
      setSelectedSeries(null);
      setDetails(null);
      setCategory('');
      setOffset(0);
      setEpisodePage(0);
    };
    const focusControl = (name: string, index: number) => {
      setZone({ name, index });
      onContentFocus();
    };
    const tabs = [
      ...VOD_PROVIDERS,
      { id: 'recent' as const, label: t('vodRecent') },
      { id: 'history' as const, label: t('continueWatching') },
    ];
    const start = localPaging ? episodePage * PAGE_SIZE : offset;
    const total = localPaging ? mediaItems.length : page?.total ?? 0;
    const hasNext = localPaging
      ? start + PAGE_SIZE < total
      : Boolean(page?.hasMore);

    return (
      <View testID="vod-screen" style={styles.root}>
        <View style={styles.headingRow}>
          {selectedSeries ? (
            <CatalogButton
              label={t('vodBackToCatalog')}
              icon="close"
              testID="vod-back"
              onPress={backToCatalog}
              onFocus={() => focusControl('header', 0)}
            />
          ) : (
            <Text style={styles.heading}>VOD</Text>
          )}
          {selectedSeries ? (
            <Text numberOfLines={1} style={styles.detailHeading}>
              {selectedSeries.title}
            </Text>
          ) : (
            <TextInput
              testID="vod-search"
              style={styles.search}
              placeholder={t('vodSearch')}
              placeholderTextColor="#b8c1cc"
              accessibilityLabel={t('vodSearch')}
              value={draft}
              onChangeText={setDraft}
              returnKeyType="search"
              onFocus={() => focusControl('header', 0)}
              onSubmitEditing={() => {
                focusAfterLoad.current = true;
                setQuery(draft);
                setOffset(0);
                setEpisodePage(0);
              }}
            />
          )}
          {!selectedSeries && query ? (
            <CatalogButton
              label={t('vodClearSearch')}
              icon="close"
              testID="vod-clear-search"
              onPress={() => {
                focusAfterLoad.current = true;
                setDraft('');
                setQuery('');
                setOffset(0);
                setEpisodePage(0);
              }}
            />
          ) : null}
        </View>
        {!selectedSeries ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabRow}
            contentContainerStyle={styles.tabContent}
          >
            {tabs.map((item, index) => (
              <CatalogButton
                key={item.id}
                label={item.label}
                selected={tab === item.id}
                testID={`vod-provider-${item.id}`}
                onPress={() => changeTab(item.id)}
                onFocus={() => focusControl('tabs', index)}
              />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.tabContent}
        >
          {selectedSeries && details
            ? [
                { season_id: '', title: t('vodAllEpisodes') },
                ...details.seasons,
              ].map((item, index) => (
                <CatalogButton
                  key={item.season_id}
                  label={item.title}
                  selected={season === item.season_id}
                  testID={`vod-season-${item.season_id || 'all'}`}
                  onPress={() => {
                    focusAfterLoad.current = true;
                    setSeason(item.season_id);
                    setEpisodePage(0);
                  }}
                  onFocus={() => focusControl('filters', index)}
                />
              ))
            : !selectedSeries && provider && page
            ? ['', ...page.categories].map((name, index) => (
                <CatalogButton
                  key={name}
                  label={name || t('vodAllCategories')}
                  selected={category === name}
                  testID={`vod-category-${index}`}
                  onPress={() => {
                    focusAfterLoad.current = true;
                    setCategory(name);
                    setOffset(0);
                  }}
                  onFocus={() => focusControl('filters', index)}
                />
              ))
            : null}
        </ScrollView>
        {loading ? (
          <View style={[styles.status, { height: cardHeight + 26 }]}>
            <ActivityIndicator
              testID="vod-loading"
              size="large"
              color="#38bdf8"
            />
            <Text style={styles.statusText}>{t('vodLoading')}</Text>
          </View>
        ) : error ? (
          <View style={[styles.status, { height: cardHeight + 26 }]}>
            <Text style={styles.statusText}>{t('vodUnavailable')}</Text>
            <CatalogButton
              testID="vod-retry"
              label={t('vodRetry')}
              onPress={() => setRetry(value => value + 1)}
              onFocus={() => focusControl('status', 0)}
            />
          </View>
        ) : displayedItems.length ? (
          <MediaCarousel
            key={viewKey}
            id="vod-items"
            ref={carouselRef}
            items={displayedItems}
            itemWidth={cardWidth}
            height={cardHeight + 8}
            preferredFocus={active && zone.name === 'items'}
            leadingInset={MAIN_CONTENT_INSET_LEFT}
            trailingInset={MAIN_CONTENT_INSET_RIGHT}
            active={active && zone.name === 'items'}
            leftFocusDestination={menuFocusDestination}
            keyExtractor={item => item.id}
            renderItem={(item, _index, focused) => (
              <VodCard
                item={item}
                width={cardWidth}
                height={cardHeight}
                focused={focused}
              />
            )}
            onItemFocus={(item, index) => {
              focusControl('items', index);
              playFocusSound();
              focusPreview(item);
            }}
            onItemSelect={handleSelect}
          />
        ) : (
          <View style={[styles.status, { height: cardHeight + 26 }]}>
            <Text style={styles.statusText}>{t('vodEmpty')}</Text>
          </View>
        )}
        {!loading && !error && total > 0 ? (
          <View style={styles.pagination}>
            <Text style={styles.count}>
              {Math.min(start + 1, total)} -{' '}
              {Math.min(start + displayedItems.length, total)} / {total}
            </Text>
            <CatalogButton
              testID="vod-previous"
              label={t('vodPrevious')}
              disabled={start === 0}
              onFocus={() => focusControl('paging', 0)}
              onPress={() => {
                focusAfterLoad.current = true;
                if (localPaging) {
                  setEpisodePage(value => Math.max(0, value - 1));
                } else {
                  setOffset(value => Math.max(0, value - PAGE_SIZE));
                }
              }}
            />
            <CatalogButton
              testID="vod-next"
              label={t('vodNext')}
              disabled={!hasNext}
              onFocus={() => focusControl('paging', 1)}
              onPress={() => {
                focusAfterLoad.current = true;
                if (localPaging) {
                  setEpisodePage(value => value + 1);
                } else {
                  setOffset(page?.nextOffset ?? offset + PAGE_SIZE);
                }
              }}
            />
          </View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 6 },
  headingRow: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  heading: { color: '#ffffff', fontSize: 22, fontWeight: '700', flex: 1 },
  detailHeading: { color: '#ffffff', fontSize: 18, fontWeight: '600', flex: 1 },
  search: {
    width: 260,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#73808a',
    paddingHorizontal: 10,
    paddingVertical: 0,
    color: '#ffffff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  tabRow: { flexGrow: 0, height: 38, marginBottom: 4 },
  filterRow: { flexGrow: 0, height: 38, marginBottom: 6 },
  tabContent: { alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  button: {
    minWidth: 36,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  selectedButton: { borderColor: '#38bdf8', backgroundColor: '#17313e' },
  focusedButton: { borderColor: '#ffffff', backgroundColor: '#344751' },
  disabledButton: { opacity: 0.35 },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 210,
  },
  icon: { width: 16, height: 16, tintColor: '#ffffff' },
  status: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  statusText: { color: '#e2e8f0', fontSize: 15 },
  pagination: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  count: { color: '#d7e0e5', fontSize: 13, flex: 1 },
});
