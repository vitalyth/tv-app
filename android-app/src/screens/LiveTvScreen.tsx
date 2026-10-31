import { useLiveEpg } from '../state/liveEpg';
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
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  useTVEventHandler,
  useWindowDimensions,
  View,
  type FocusDestination,
} from 'react-native';
import {
  fillGuideGaps,
  getProgramGuide,
  GUIDE_SLOT_MS,
  guideMediaItem,
  guideStart,
  GUIDE_WINDOW_MS,
  normalizePrograms,
  programAt,
  type GuideData,
} from '../api/programGuide';
import type { PageContentHandle } from '../components/PageContent';
import { currentTimeMs, resolvePosterUrl } from '../api/channels';
import { RemoteImage } from '../components/RemoteImage';
import { t } from '../i18n';
import { useMediaActions, useMediaController } from '../media/MediaController';
import { useMediaPreviewEngine } from '../media/MediaPreviewEngine';
import { isSameMediaItem, type MediaItem } from '../media/player';
import { playFocusSound } from '../platform/focusSound';
import {
  MAIN_CONTENT_INSET_LEFT,
  MAIN_CONTENT_INSET_RIGHT,
} from '../theme/layout';

const CHANNEL_WIDTH = 124;
const SLOT_WIDTH = 180;
const ROW_HEIGHT = 42;
const ACTIVE_HEIGHT = 74;
const HEADER_HEIGHT = 30;
const clock = (time: number) => {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};
interface Props {
  active: boolean;
  menuFocusDestination: FocusDestination;
  onContentFocus: () => void;
  onItemFocused?: (item: MediaItem) => void;
}
interface Selection {
  channelId: string;
  anchor: number;
  column: 'channel' | 'program';
}

export const LiveTvScreen = forwardRef<PageContentHandle, Props>(
  function LiveTvScreenImpl(
    { active, menuFocusDestination, onContentFocus, onItemFocused },
    ref,
  ) {
    const [data, setData] = useState<GuideData | null>(null);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [now, setNow] = useState(currentTimeMs);
    const [selection, setSelection] = useState<Selection>({
      channelId: '',
      anchor: now,
      column: 'program',
    });
    const [focused, setFocused] = useState(false);
    const [gridHeight, setGridHeight] = useState(270);
    const { width } = useWindowDimensions();
    const viewportWidth = Math.max(
      180,
      width - MAIN_CONTENT_INSET_LEFT - CHANNEL_WIDTH,
    );
    const controller = useMediaController();
    const { openFullscreen, showImage } = useMediaActions();
    const focusRef = useRef<View & { requestTVFocus?: () => void }>(null);
    const row = Math.max(
      0,
      data?.channels.findIndex(ch => ch.id === selection.channelId) ?? 0,
    );
    const channel = data?.channels[row];
    const schedules = useMemo(() => {
      const map: Record<string, ReturnType<typeof fillGuideGaps>> = {};
      if (data) {
        for (const ch of data.channels) {
          map[ch.id] = fillGuideGaps(
            data.programs[ch.id] || [],
            data.start,
            data.end,
          );
        }
      }
      return map;
    }, [data]);
    const programs = channel ? schedules[channel.id] : [];
    const column = programAt(programs || [], selection.anchor);
    const program = programs?.[column];
    const selectedItem = useMemo(
      () => (channel && program ? guideMediaItem(channel, program, now) : null),
      [channel, program, now],
    );
    const preview = useMediaPreviewEngine({
      videoPreviewEnabled: Boolean(selectedItem?.isLive),
    });
    // Vega can retain native callbacks from an earlier render.
    const latest = useRef({
      active,
      data,
      selection,
      row,
      column,
      programs,
      channel,
      selectedItem,
      controller,
      preview,
      onContentFocus,
    });
    latest.current = {
      active,
      data,
      selection,
      row,
      column,
      programs,
      channel,
      selectedItem,
      controller,
      preview,
      onContentFocus,
    };

    useEffect(() => {
      let mounted = true;
      let inFlight = false;
      const refresh = async () => {
        if (inFlight) {
          return;
        }
        inFlight = true;
        try {
          const guide = await getProgramGuide();
          if (mounted) {
            setData(guide);
            setFailed(false);
            setNow(currentTimeMs());
            setSelection(previous => ({
              ...previous,
              channelId: guide.channels.some(ch => ch.id === previous.channelId)
                ? previous.channelId
                : guide.channels.find(ch =>
                    isSameMediaItem(ch, latest.current.controller.item),
                  )?.id ||
                  guide.channels[0]?.id ||
                  '',
              anchor: latest.current.selectedItem?.isLive
                ? currentTimeMs()
                : Math.max(
                    guide.start,
                    Math.min(guide.end - 1, previous.anchor),
                  ),
            }));
          }
        } catch {
          if (mounted) {
            setFailed(true);
          }
        } finally {
          inFlight = false;
        }
      };
      refresh();
      return () => {
        mounted = false;
      };
    }, [retry]);

    const epg = useLiveEpg();
    useEffect(() => {
      if (!epg.channels.length) return;
      const time = currentTimeMs();
      setData(() => {
        const start = guideStart(time);
        const channels = epg.channels;
        const updatedPrograms = Object.fromEntries(
          channels.map(entry => [
            entry.id,
            normalizePrograms(
              (entry.sourcePayload as { programs?: unknown } | undefined)
                ?.programs,
            ),
          ]),
        );
        return { channels, programs: updatedPrograms, start, end: start + GUIDE_WINDOW_MS };
      });
      setFailed(false);
      setNow(time);
      setSelection(previous => ({
        ...previous,
        channelId: epg.channels.some(
          entry => entry.id === previous.channelId,
        )
          ? previous.channelId
          : epg.channels[0].id,
        anchor: latest.current.selectedItem?.isLive ? time : previous.anchor,
      }));
    }, [epg]);

    const previewRef = useRef(preview);
    previewRef.current = preview;
    useEffect(() => {
      if (!active || controller.isFullscreen || !selectedItem) {
        return;
      }
      onItemFocused?.(selectedItem);
      if (!selectedItem.isLive) {
        previewRef.current.clearPreview({ stopMedia: false });
        const timer = setTimeout(() => showImage(selectedItem), 300);
        return () => clearTimeout(timer);
      }
      if (isSameMediaItem(controller.item, selectedItem) && controller.stream) {
        return;
      }
      previewRef.current.focusMediaItem(selectedItem);
      // Playback state updates must not restart the preview.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, selectedItem, showImage]);
    useEffect(() => {
      if (!active) {
        previewRef.current.clearPreview({ stopMedia: false });
      }
    }, [active]);
    useEffect(
      () => () => previewRef.current.clearPreview({ stopMedia: false }),
      [],
    );

    const requestFocus = useCallback(
      () => focusRef.current?.requestTVFocus?.(),
      [],
    );
    useImperativeHandle(
      ref,
      () => ({
        canExitToMenu: () =>
          !controller.isFullscreen && selection.column === 'channel',
        focusFirst() {
          requestFocus();
        },
        restoreFocus(itemId) {
          const match = latest.current.data?.channels.find(
            ch => ch.id === itemId,
          );
          if (match) {
            setSelection({
              channelId: match.id,
              anchor: currentTimeMs(),
              column: 'program',
            });
          }
          requestFocus();
        },
      }),
      [controller.isFullscreen, selection.column, requestFocus],
    );

    const activate = useCallback(() => {
      const current = latest.current;
      if (
        !current.active ||
        current.controller.isFullscreen ||
        !current.channel
      ) {
        return;
      }
      current.preview.clearPreview({ stopMedia: false });
      // Schedule entries open their live channel, not an invented catch-up stream.
      openFullscreen(
        current.selectedItem?.isLive ? current.selectedItem : current.channel,
      );
    }, [openFullscreen]);

    useTVEventHandler(event => {
      const current = latest.current;
      if (
        event.eventKeyAction === 1 ||
        !current.active ||
        current.controller.isFullscreen ||
        !current.channel ||
        !current.data
      ) {
        return;
      }
      const next = { ...current.selection };
      if (event.eventType === 'up' || event.eventType === 'down') {
        const index = Math.max(
          0,
          Math.min(
            current.data.channels.length - 1,
            current.row + (event.eventType === 'up' ? -1 : 1),
          ),
        );
        if (index === current.row) {
          return;
        }
        next.channelId = current.data.channels[index].id;
      } else if (event.eventType === 'right') {
        if (next.column === 'channel') {
          next.column = 'program';
        } else {
          const target = current.programs[current.column + 1];
          if (!target) {
            return;
          }
          next.anchor = target.start;
        }
      } else if (event.eventType === 'left') {
        if (next.column === 'channel') {
          return;
        }
        if (current.column === 0) {
          next.column = 'channel';
        } else {
          next.anchor = current.programs[current.column - 1].start;
        }
      } else {
        return;
      }
      playFocusSound();
      setSelection(next);
    });

    const contentWidth = data
      ? ((data.end - data.start) / GUIDE_SLOT_MS) * SLOT_WIDTH
      : 0;
    const offsetRef = useRef(0);
    const startX =
      program && data
        ? ((program.start - data.start) / GUIDE_SLOT_MS) * SLOT_WIDTH
        : 0;
    const endX =
      program && data
        ? ((program.end - data.start) / GUIDE_SLOT_MS) * SLOT_WIDTH
        : 0;
    let offset = offsetRef.current;
    if (startX < offset) {
      offset = startX;
    } else if (endX > offset + viewportWidth) {
      offset = Math.min(startX, endX - viewportWidth);
    }
    offset = Math.max(
      0,
      Math.min(Math.max(0, contentWidth - viewportWidth), offset),
    );
    offsetRef.current = offset;
    const visibleCount = Math.max(
      1,
      1 + Math.floor((gridHeight - HEADER_HEIGHT - ACTIVE_HEIGHT) / ROW_HEIGHT),
    );
    const firstRow = Math.max(
      0,
      Math.min(
        row - Math.min(1, visibleCount - 1),
        (data?.channels.length || 0) - visibleCount,
      ),
    );
    const visibleChannels =
      data?.channels.slice(firstRow, firstRow + visibleCount) || [];
    const rowsHeight = Math.max(0, gridHeight - HEADER_HEIGHT);
    const activeRowHeight = Math.min(ACTIVE_HEIGHT, rowsHeight);
    const extraRowHeight = visibleChannels.length
      ? Math.max(
          0,
          rowsHeight -
            activeRowHeight -
            (visibleChannels.length - 1) * ROW_HEIGHT,
        ) / visibleChannels.length
      : 0;
    const liveX = data
      ? ((now - data.start) / GUIDE_SLOT_MS) * SLOT_WIDTH - offset
      : -1;

    return (
      <View
        testID="guide-grid"
        style={styles.root}
        onLayout={event => setGridHeight(event.nativeEvent.layout.height)}
      >
        {!data?.channels.length ? (
          failed ? (
            <Pressable
              testID="guide-retry"
              focusable={active}
              hasTVPreferredFocus={active}
              onFocus={onContentFocus}
              onPress={() => {
                setFailed(false);
                setRetry(value => value + 1);
              }}
            >
              <Text style={styles.status}>
                {t('guideUnavailable')} · {t('vodRetry')}
              </Text>
            </Pressable>
          ) : data ? (
            <Text style={styles.status}>{t('guideEmpty')}</Text>
          ) : (
            <ActivityIndicator color="#ffffff" />
          )
        ) : (
          <TVFocusGuideView
            style={styles.guide}
            trapFocusUp
            trapFocusDown
            trapFocusRight
            trapFocusLeft={selection.column !== 'channel'}
          >
            <Pressable
              ref={focusRef}
              testID="guide-focus"
              accessibilityLabel={`${channel?.channelName}, ${
                program?.title || t('guideNoProgram')
              }`}
              focusable={active}
              hasTVPreferredFocus={active}
              nextFocusLeft={
                selection.column === 'channel'
                  ? menuFocusDestination
                  : undefined
              }
              onFocus={() => {
                setFocused(true);
                latest.current.onContentFocus();
              }}
              onBlur={() => setFocused(false)}
              onPress={activate}
              style={styles.focusAnchor}
            />
            <View style={styles.header} pointerEvents="none">
              <View style={styles.channelHeader} />
              <View style={styles.timeline}>
                {Array.from(
                  { length: contentWidth / SLOT_WIDTH + 1 },
                  (_, index) => {
                    const x = index * SLOT_WIDTH - offset;
                    return x >= 0 && x <= viewportWidth - 60 ? (
                      <Text key={index} style={[styles.tick, { left: x }]}>
                        {clock(data.start + index * GUIDE_SLOT_MS)}
                      </Text>
                    ) : null;
                  },
                )}
                {liveX >= 0 && liveX <= viewportWidth ? (
                  <View
                    testID="guide-live-time"
                    style={[
                      styles.liveTime,
                      {
                        left: Math.max(
                          0,
                          Math.min(viewportWidth - 52, liveX - 26),
                        ),
                      },
                    ]}
                  >
                    <Text style={styles.liveTimeText}>{clock(now)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {visibleChannels.map((ch, index) => {
              const isSelected = ch.id === channel?.id;
              const height =
                (isSelected ? activeRowHeight : ROW_HEIGHT) + extraRowHeight;
              const rowGap = index === visibleChannels.length - 1 ? 0 : 4;
              const highlight = active && focused && isSelected;
              return (
                <View
                  key={ch.id}
                  testID={`guide-row-${firstRow + index}`}
                  style={[styles.row, { height }]}
                >
                  <Pressable
                    testID={`guide-channel-${ch.id}`}
                    focusable={false}
                    onPress={() => {
                      setSelection({
                        channelId: ch.id,
                        anchor: currentTimeMs(),
                        column: 'channel',
                      });
                      requestFocus();
                    }}
                    style={[
                      styles.channel,
                      { marginBottom: rowGap },
                      highlight && styles.activeChannel,
                      highlight &&
                        selection.column === 'channel' &&
                        styles.focused,
                    ]}
                  >
                    {ch.fallbackImageUrl ? (
                      <RemoteImage
                        uri={ch.fallbackImageUrl}
                        resizeMode="contain"
                        style={styles.logo}
                      />
                    ) : null}
                    <View style={styles.channelText}>
                      <Text numberOfLines={1} style={styles.number}>
                        {ch.channelNumber}
                      </Text>
                      <Text numberOfLines={1} style={styles.channelName}>
                        {ch.channelName}
                      </Text>
                    </View>
                    {isSameMediaItem(controller.item, ch) &&
                    controller.stream ? (
                      <View
                        testID={`guide-playing-${ch.id}`}
                        style={styles.playing}
                      />
                    ) : null}
                  </Pressable>
                  <View style={styles.timeline}>
                    {schedules[ch.id].map((entry, programIndex) => {
                      const x =
                        ((entry.start - data.start) / GUIDE_SLOT_MS) *
                          SLOT_WIDTH -
                        offset;
                      const cellWidth =
                        ((entry.end - entry.start) / GUIDE_SLOT_MS) *
                        SLOT_WIDTH;
                      if (x + cellWidth <= 0 || x >= viewportWidth) {
                        return null;
                      }
                      const left = Math.max(0, x);
                      const visibleWidth =
                        Math.min(viewportWidth, x + cellWidth) - left;
                      const selected =
                        highlight &&
                        selection.column === 'program' &&
                        programIndex === column;
                      const live = entry.start <= now && now < entry.end;
                      const artwork = !entry.placeholder
                        ? resolvePosterUrl({ image: entry.image }) ||
                          (live ? ch.imageUrl : undefined)
                        : undefined;
                      const showArtwork =
                        isSelected &&
                        Boolean(artwork) &&
                        visibleWidth >= 170 &&
                        height - rowGap >= 58;
                      return (
                        <Pressable
                          key={entry.id}
                          testID={`guide-cell-${
                            firstRow + index
                          }-${programIndex}`}
                          focusable={false}
                          onPress={() => {
                            setSelection({
                              channelId: ch.id,
                              anchor: entry.start,
                              column: 'program',
                            });
                            requestFocus();
                          }}
                          style={[
                            styles.cell,
                            {
                              left,
                              width: Math.max(1, visibleWidth - 4),
                              height: Math.max(0, height - rowGap),
                            },
                            live && styles.liveCell,
                            selected && styles.focused,
                          ]}
                        >
                          <View style={styles.programContent}>
                            {showArtwork ? (
                              <RemoteImage
                                testID={`guide-program-image-${ch.id}-${entry.id}`}
                                uri={artwork!}
                                fallbackUri={ch.fallbackImageUrl}
                                resizeMode="cover"
                                style={styles.programImage}
                              />
                            ) : null}
                            <View style={styles.programText}>
                              <Text
                                numberOfLines={isSelected ? 2 : 1}
                                style={[
                                  styles.programTitle,
                                  entry.placeholder && styles.placeholder,
                                ]}
                              >
                                {entry.title || t('guideNoProgram')}
                              </Text>
                              {isSelected && visibleWidth >= 95 ? (
                                <Text
                                  numberOfLines={1}
                                  style={styles.programTime}
                                >
                                  {clock(entry.start)} - {clock(entry.end)}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {liveX >= 0 && liveX <= viewportWidth ? (
              <View
                testID="guide-live-line"
                pointerEvents="none"
                style={[
                  styles.liveLine,
                  {
                    left: CHANNEL_WIDTH + liveX,
                    height: rowsHeight,
                  },
                ]}
              />
            ) : null}
          </TVFocusGuideView>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    marginTop: 16,
    marginRight: -MAIN_CONTENT_INSET_RIGHT,
    overflow: 'hidden',
  },
  guide: { flex: 1 },
  status: { color: '#ffffff', fontSize: 16, padding: 12 },
  focusAnchor: { ...StyleSheet.absoluteFillObject, zIndex: 1, opacity: 0.01 },
  header: { height: HEADER_HEIGHT, flexDirection: 'row' },
  channelHeader: { width: CHANNEL_WIDTH, justifyContent: 'center' },
  timeline: { flex: 1, overflow: 'hidden', position: 'relative' },
  tick: {
    position: 'absolute',
    color: '#c0cbd4',
    fontSize: 12,
    top: 4,
    width: 60,
  },
  row: { flexDirection: 'row' },
  channel: {
    width: CHANNEL_WIDTH - 6,
    marginRight: 6,
    marginBottom: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(18, 23, 29, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: { width: 30, height: 28 },
  channelText: { flex: 1, minWidth: 0 },
  channelName: { color: '#e0e5eb', fontSize: 11 },
  number: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  playing: { width: 5, height: 5, backgroundColor: '#25d4de', borderRadius: 3 },
  cell: {
    position: 'absolute',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(24, 29, 35, 0.94)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  liveCell: { backgroundColor: 'rgba(38, 55, 58, 0.95)' },
  activeChannel: { borderColor: '#25d4de', backgroundColor: '#244044' },
  focused: { borderColor: '#ffffff', backgroundColor: '#34474a' },
  programContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  programImage: { width: 80, height: 45, borderRadius: 3 },
  programText: { flex: 1, minWidth: 0 },
  programTitle: { color: '#ffffff', fontSize: 13, lineHeight: 17 },
  placeholder: { color: '#9ca6af' },
  programTime: { color: '#bdcbd0', fontSize: 11, marginTop: 3 },
  liveLine: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    width: 2,
    backgroundColor: '#f04757',
  },
  liveTime: {
    position: 'absolute',
    top: 3,
    width: 52,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#e82034',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTimeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
