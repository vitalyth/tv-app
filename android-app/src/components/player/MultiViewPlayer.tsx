import {liveEpgStore} from '../../state/liveEpg';
import {useChannelDrawerViewport} from '../../hooks/useChannelDrawerViewport';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  useTVEventHandler,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../../api/channels';
import {
  useMediaActions,
  useMediaController,
} from '../../media/MediaController';
import {
  multiViewMaxStreams,
  multiViewTileLayout,
} from '../../media/multiViewLayout';
import { isSameMediaItem, type MediaItem } from '../../media/player';
import { tvPlatform } from '../../platform/runtime';
import { t } from '../../i18n';
import { RemoteImage } from '../RemoteImage';
import { LiveChannelDrawer } from './LiveChannelDrawer';
import { softwareMultiViewAvailable } from '../../media/nativeMultiView';

type Action = 'add' | 'change' | 'fullscreen' | 'remove' | 'backend';
type Picker = { index: number; replace: boolean };
const PANELS_HIDE_DELAY_MS = 4500;
const icon = {
  backend: require('../../assets/icons/settings.png'),
  add: require('../../assets/icons/add.png'),
  change: require('../../assets/icons/change.png'),
  fullscreen: require('../../assets/icons/fullscreen.png'),
  remove: require('../../assets/icons/close.png'),
};

export function MultiViewPlayer({onChannelDrawerChange}: {onChannelDrawerChange?: (open: boolean) => void}) {
  const controller = useMediaController();
  const media = useMediaActions();
  const { setMultiViewAudio } = media;
  const { width, height } = useWindowDimensions();
  const count = (controller.multiView?.tiles.length ?? 0) + 1;
  const maxStreams = multiViewMaxStreams(controller.multiView?.backend);
  const [tile, setTile] = useState(0);
  const focusedTile = Math.min(tile, count - 1);
  const [action, setAction] = useState<Action | null>(null);
  const [infoVisible, setInfoVisible] = useState(true);
  const [picker, setPicker] = useState<Picker | null>(() =>
    count === 1 ? { index: 1, replace: false } : null,
  );
  const viewportStyle = useChannelDrawerViewport(picker !== null);
  useEffect(() => {
    onChannelDrawerChange?.(picker !== null);
    return () => onChannelDrawerChange?.(false);
  }, [picker, onChannelDrawerChange]);
  const [resolving, setResolving] = useState<string>();
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const lastInteraction = useRef(0);
  const anchor = useRef<View & { requestTVFocus?: () => void }>(null);
  const actions: Action[] = [
    'fullscreen',
    ...(count < maxStreams ? ['add' as const] : []),
    'change',
    ...(count > 1 ? ['remove' as const] : []),
    ...(softwareMultiViewAvailable && count <= 2 ? ['backend' as const] : []),
  ];
  const selected =
    focusedTile === 0
      ? controller.item
      : controller.multiView?.tiles[focusedTile - 1]?.item;
  useEffect(() => {
    setInfoVisible(true);
    const timer = setTimeout(() => setInfoVisible(false), PANELS_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focusedTile, selected?.id]);
  const selectedStatus =
    focusedTile === 0
      ? controller.status
      : controller.multiView?.tiles[focusedTile - 1]?.status;
  const latest = useRef({
    controller,
    media,
    tile: focusedTile,
    action,
    picker,
    count,
    actions,
    selected,
    selectedStatus,
  });
  latest.current = {
    controller,
    media,
    tile: focusedTile,
    action,
    picker,
    count,
    actions,
    selected,
    selectedStatus,
  };

  useEffect(() => {
    setMultiViewAudio(selectedStatus === 'playing' ? focusedTile : -1);
  }, [focusedTile, selectedStatus, setMultiViewAudio]);

  const closePicker = useCallback(() => {
    request.current += 1;
    lastInteraction.current = Date.now();
    setPicker(null);
    setAction(null);
    setResolving(undefined);
    setError(undefined);
  }, []);
  useEffect(() => {
    if (!picker) {
      const timer = setTimeout(() => anchor.current?.requestTVFocus?.(), 80);
      return () => clearTimeout(timer);
    }
  }, [picker]);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!action) {
      return;
    }
    const timer = setTimeout(() => setAction(null), PANELS_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [action, focusedTile, picker]);
  useEffect(() => {
    if (controller.status !== 'loading' || controller.paused) {
      return;
    }
    const timer = setTimeout(media.markError, 25000);
    return () => clearTimeout(timer);
  }, [
    controller.stream,
    controller.status,
    controller.paused,
    media.markError,
  ]);

  const openPicker = useCallback((replace = false) => {
    const current = latest.current;
    if (
      !replace &&
      current.count >=
        multiViewMaxStreams(current.controller.multiView?.backend)
    ) {
      return;
    }
    setError(undefined);
    setAction(null);
    setPicker({ index: replace ? current.tile : current.count, replace });
  }, []);
  const loadChannels = useCallback(() => {
    const channels = liveEpgStore.getSnapshot().channels;
    return channels.length ? Promise.resolve(channels) : getPlayableLiveChannels();
  }, []);
  const selectChannel = useCallback(
    async (channel: MediaItem) => {
      const current = latest.current;
      if (!current.picker) {
        return;
      }
      const playing = [
        {item: current.controller.item, status: current.controller.status},
        ...(current.controller.multiView?.tiles ?? []),
      ];
      const exact = playing.findIndex(entry => entry.item?.id === channel.id);
      const existing = exact >= 0 ? exact : playing.findIndex(entry => isSameMediaItem(entry.item, channel));
      if (existing >= 0 && playing[existing].status !== 'error') {
        setTile(existing);
        closePicker();
        return;
      }
      const targetIndex = existing >= 0 ? existing : current.picker.index;
      const sequence = ++request.current;
      setResolving(channel.id);
      setError(undefined);
      try {
        const stream = await resolveLiveChannelStream(channel);
        if (sequence !== request.current) {
          return;
        }
        if (targetIndex === 0) {
          current.media.setMultiViewPrimary(channel, stream);
        } else {
          current.media.setMultiViewChannel(channel, stream, targetIndex);
        }
        setTile(targetIndex);
        closePicker();
      } catch {
        if (sequence === request.current) {
          setResolving(undefined);
          setError(t('playerChannelUnavailable'));
        }
      }
    },
    [closePicker],
  );

  const runAction = useCallback(
    (command: Action) => {
      const current = latest.current;
      if (command === 'backend') {
        current.media.setMultiViewBackend(
          current.controller.multiView?.backend === 'software'
            ? 'platform'
            : 'software',
        );
        setAction(null);
      } else if (command === 'add') {
        openPicker();
      } else if (command === 'change') {
        openPicker(true);
      } else if (command === 'fullscreen') {
        if (current.selectedStatus === 'error') {
          openPicker(true);
          return;
        }
        if (current.tile === 0) {
          current.media.exitMultiView();
        } else {
          const next = current.controller.multiView?.tiles[current.tile - 1];
          if (next?.status === 'playing') {
            current.media.playFullscreen(next.item, next.stream);
          }
        }
      } else if (command === 'remove' && current.count > 1) {
        current.media.removeMultiViewChannel(current.tile);
        setTile(Math.min(current.tile, current.count - 2));
        setAction(null);
      }
    },
    [openPicker],
  );
  const activate = useCallback(() => {
    const current = latest.current;
    if (current.picker || Date.now() - lastInteraction.current < 350) {
      return;
    }
    if (current.action === null) {
      setAction('fullscreen');
    } else {
      runAction(current.action);
    }
  }, [runAction]);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }
    const current = latest.current;
    if (tvPlatform.id !== 'kepler') {
      if (event.eventType === 'playpause' || event.eventType === 'playPause') {
        current.media.togglePlayPause();
        return;
      }
      if (event.eventType === 'play' || event.eventType === 'pause') {
        current.media.setPaused(event.eventType === 'pause');
        return;
      }
    }
    if (current.picker) {
      if (event.eventType === 'right') {
        closePicker();
      }
      return;
    }
    if (event.eventType === 'left') {
      if (current.action) {
        const index = current.actions.indexOf(current.action);
        setAction(
          current.actions[(index - 1 + current.actions.length) % current.actions.length],
        );
      } else {
        setTile(Math.max(0, current.tile - 1));
      }
      return;
    }
    if (event.eventType === 'right') {
      if (current.action) {
        const index = current.actions.indexOf(current.action);
        setAction(
          current.actions[
            (index + 1) %
              current.actions.length
          ],
        );
      } else if (current.tile === current.count - 1) {
        openPicker();
      } else {
        setTile(
          Math.max(0, Math.min(current.count - 1, current.tile + 1)),
        );
      }
    } else if (event.eventType === 'up' || event.eventType === 'down') {
      setAction(null);
      setTile(
        Math.max(
          0,
          Math.min(
            current.count - 1,
            current.tile + (event.eventType === 'up' ? -2 : 2),
          ),
        ),
      );
    }
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (latest.current.picker) {
          closePicker();
        } else {
          latest.current.media.exitMultiView();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [closePicker]);

  if (!controller.item || !controller.multiView) {
    return null;
  }
  const labels: Record<Action, string> = {
    backend: t(
      controller.multiView.backend === 'software'
        ? 'multiStandardDecoder'
        : 'multiSoftwareDecoder',
    ),
    add: t('multiAddChannel'),
    change: t('multiChangeChannel'),
    fullscreen:
      selectedStatus === 'error' ? t('vodRetry') : t('multiFullscreen'),
    remove: t('multiRemove'),
  };
  const tiles = [
    { item: controller.item, status: controller.status },
    ...controller.multiView.tiles,
  ];
  return (
    <TVFocusGuideView
      testID="multiview-player"
      style={styles.root}
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
    >
      <Pressable
        ref={anchor}
        testID="multiview-focus"
        hasTVPreferredFocus
        focusable={!picker}
        accessibilityLabel={
          action ? labels[action] : selected?.channelName || selected?.title
        }
        onPress={activate}
        style={styles.anchor}
      />
      <Animated.View
        testID="multiview-overlay-viewport"
        pointerEvents={picker ? 'none' : 'box-none'}
        style={[StyleSheet.absoluteFill, viewportStyle]}
      >
      {tiles.map((entry, index) => (
        <View
          key={entry.item.id}
          testID={`multiview-tile-${index}`}
          style={[
            multiViewTileLayout(index, count, width, height),
            styles.tile,
            focusedTile === index && styles.focused,
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            focusable={false}
            accessibilityLabel={entry.item.channelName || entry.item.title}
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setTile(index);
              setAction('fullscreen');
            }}
          />
          {entry.status === 'loading' ? (
            <Text pointerEvents="none" style={styles.state}>
              {t('playerSourceConnecting')}
            </Text>
          ) : entry.status === 'error' ? (
            <View pointerEvents="none" style={styles.failure}>
              <Text style={styles.state}>{t('multiPlaybackError')}</Text>
            </View>
          ) : null}
          {infoVisible ? (
          <View testID={`multiview-caption-${index}`} pointerEvents="none" style={styles.caption}>
            {entry.item.fallbackImageUrl ? (
              <RemoteImage
                uri={entry.item.fallbackImageUrl}
                resizeMode="contain"
                style={styles.logo}
              />
            ) : null}
            <View style={styles.metadata}>
              <Text numberOfLines={1} style={styles.channel}>
                {entry.item.channelNumber}{' '}
                {entry.item.channelName || entry.item.title}
              </Text>
              <Text numberOfLines={1} style={styles.program}>
                {entry.item.title}
              </Text>
            </View>
          </View>
          ) : null}
          {focusedTile === index && action && !picker ? (
            <View style={styles.controls}>
              {actions.map(command => (
                <Pressable
                  key={command}
                  testID={`multiview-${command}`}
                  focusable={false}
                  accessibilityLabel={labels[command]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: action === command }}
                  onPress={() => runAction(command)}
                  style={[
                    styles.button,
                    action === command && styles.buttonFocused,
                  ]}
                >
                  <Image
                    source={icon[command]}
                    style={[
                      styles.icon,
                      action === command && styles.iconFocused,
                    ]}
                  />
                </Pressable>
              ))}
              {action === 'backend' ? (
                <Text style={styles.decoderLabel}>{labels.backend}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      </Animated.View>
      {picker ? (
        <LiveChannelDrawer
          item={selected || controller.item}
          loadChannels={loadChannels}
          switchingChannelId={resolving}
          error={error}
          onSelectChannel={selectChannel}
          onClose={closePicker}
        />
      ) : null}
    </TVFocusGuideView>
  );
}

const styles = StyleSheet.create({
  decoderLabel: {
    position: 'absolute',
    bottom: 52,
    color: '#ffffff',
    fontSize: 14,
    width: 260,
    textAlign: 'center',
  },
  root: { ...StyleSheet.absoluteFillObject },
  anchor: { ...StyleSheet.absoluteFillObject, opacity: 0.01 },
  tile: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  focused: { borderColor: '#16d7d7' },
  caption: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    height: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    padding: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 14, 20, 0.80)',
  },
  logo: { width: 40, height: 40 },
  metadata: { flex: 1, minWidth: 0 },
  channel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  program: { color: '#d2d7da', fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute',
    right: 18,
    top: 18,
    flexDirection: 'row',
    gap: 4,
    padding: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: 'rgba(10, 14, 20, 0.80)',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#20242a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFocused: { backgroundColor: '#17d7d7' },
  icon: { width: 22, height: 22, tintColor: '#ffffff' },
  iconFocused: { tintColor: '#031012' },
  state: { color: '#ffffff', fontSize: 14, textAlign: 'center', padding: 16 },
  failure: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#101619',
    justifyContent: 'center',
  },
});
