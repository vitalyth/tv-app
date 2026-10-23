import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  MULTIVIEW_MAX_STREAMS,
  multiViewTileLayout,
} from '../../media/multiViewLayout';
import { isSameMediaItem, type MediaItem } from '../../media/player';
import { tvPlatform } from '../../platform/runtime';
import { t } from '../../i18n';
import { RemoteImage } from '../RemoteImage';
import { LiveChannelDrawer } from './LiveChannelDrawer';

type Action = 'add' | 'fullscreen' | 'remove';
type Picker = { index: number; replace: boolean };
const icon = {
  add: require('../../assets/icons/add.png'),
  fullscreen: require('../../assets/icons/fullscreen.png'),
  remove: require('../../assets/icons/close.png'),
};

export function MultiViewPlayer() {
  const controller = useMediaController();
  const media = useMediaActions();
  const { setMultiViewAudio } = media;
  const { width, height } = useWindowDimensions();
  const count = (controller.multiView?.tiles.length ?? 0) + 1;
  const [tile, setTile] = useState(0);
  const focusedTile = Math.min(tile, count - 1);
  const [action, setAction] = useState<Action | null>(null);
  const [picker, setPicker] = useState<Picker | null>(() =>
    count === 1 ? { index: 1, replace: false } : null,
  );
  const [resolving, setResolving] = useState<string>();
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const lastInteraction = useRef(0);
  const anchor = useRef<View & { requestTVFocus?: () => void }>(null);
  const actions: Action[] = [
    ...(count < MULTIVIEW_MAX_STREAMS ? ['add' as const] : []),
    'fullscreen',
    ...(count > 1 ? ['remove' as const] : []),
  ];
  const selected =
    focusedTile === 0
      ? controller.item
      : controller.multiView?.tiles[focusedTile - 1]?.item;
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
    const timer = setTimeout(() => setAction(null), 4500);
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
    if (!replace && current.count >= MULTIVIEW_MAX_STREAMS) {
      return;
    }
    setError(undefined);
    setAction(null);
    setPicker({ index: replace ? current.tile : current.count, replace });
  }, []);
  const loadChannels = useCallback(async () => {
    const channels = await getPlayableLiveChannels();
    const current = latest.current;
    const playing = [
      current.controller.item,
      ...(current.controller.multiView?.tiles.map(entry => entry.item) ?? []),
    ];
    return channels.filter(
      channel =>
        !playing.some(
          (entry, index) =>
            index !== current.picker?.index && isSameMediaItem(channel, entry),
        ),
    );
  }, []);
  const selectChannel = useCallback(
    async (channel: MediaItem) => {
      const current = latest.current;
      if (!current.picker) {
        return;
      }
      const targetIndex = current.picker.index;
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
      if (command === 'add') {
        openPicker();
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
    if (event.eventType === 'left' || event.eventType === 'right') {
      const direction = event.eventType === 'right' ? 1 : -1;
      if (current.action) {
        const index = current.actions.indexOf(current.action);
        setAction(
          current.actions[
            (index + direction + current.actions.length) %
              current.actions.length
          ],
        );
      } else if (direction > 0 && current.tile === current.count - 1) {
        openPicker();
      } else {
        setTile(
          Math.max(0, Math.min(current.count - 1, current.tile + direction)),
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
    add: t('multiAddChannel'),
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
          <View pointerEvents="none" style={styles.caption}>
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
            {controller.multiView?.audioTile === index ? (
              <View testID={`multiview-audio-${index}`} style={styles.audio} />
            ) : null}
          </View>
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
            </View>
          ) : null}
        </View>
      ))}
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
    bottom: 0,
    left: 0,
    right: 0,
    height: 76,
    padding: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,20,26,0.86)',
  },
  logo: { width: 40, height: 40 },
  metadata: { flex: 1, minWidth: 0 },
  channel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  program: { color: '#d2d7da', fontSize: 12, marginTop: 3 },
  audio: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16d7d7' },
  controls: {
    position: 'absolute',
    right: 18,
    top: 18,
    flexDirection: 'row',
    gap: 4,
    padding: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(8,20,26,0.9)',
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
