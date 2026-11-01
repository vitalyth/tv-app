import {channelDrawerLayout, CHANNEL_DRAWER_ANIMATION_MS, PLAYER_PANEL_INSET, PLAYER_PANEL_VERTICAL_INSET} from '../../media/playerLayout';
import { liveEpgStore, useLiveEpg } from '../../state/liveEpg';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  useTVEventHandler,
  useWindowDimensions,
} from 'react-native';
import { isSameMediaItem, type MediaItem } from '../../media/player';
import { t } from '../../i18n';
import { RemoteImage } from '../RemoteImage';
import { playFocusSound } from '../../platform/focusSound';

interface Props {
  item: MediaItem;
  loadChannels: () => Promise<MediaItem[]>;
  switchingChannelId?: string;
  error?: string;
  onSelectChannel: (channel: MediaItem) => void;
  onClose: () => void;
}

const ROW_HEIGHT = 52;
const ACTIVE_ROW_HEIGHT = 112;

function playingChannelIndex(channels: MediaItem[], item: MediaItem): number {
  const exact = channels.findIndex(channel => channel.id === item.id);
  return exact >= 0 ? exact : channels.findIndex(channel => isSameMediaItem(channel, item));
}

export const LiveChannelDrawer = memo(function LiveChannelDrawerView({
  item,
  loadChannels,
  switchingChannelId,
  error,
  onSelectChannel,
  onClose,
}: Props) {
  const [loadedChannels, setChannels] = useState<MediaItem[]>([]);
  useLiveEpg();
  const channels = loadedChannels.map(liveEpgStore.resolve);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const [listFocused, setListFocused] = useState(false);
  const [height, setHeight] = useState(400);
  const {width: screenWidth} = useWindowDimensions();
  const {drawerWidth} = channelDrawerLayout(screenWidth, 0);
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: CHANNEL_DRAWER_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);
  const focusRef = useRef<View & { requestTVFocus?: () => void }>(null);
  const latest = useRef({ channels, index, failed, onSelectChannel, item });
  latest.current = { channels, index, failed, onSelectChannel, item };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFailed(false);
    loadChannels()
      .then(result => {
        if (!mounted) {
          return;
        }
        setChannels(result);
        setIndex(Math.max(0, playingChannelIndex(result, latest.current.item)));
      })
      .catch(() => {
        if (mounted) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [loadChannels, retry]);

  useEffect(() => {
    if (loading) return;
    // Wait for the selected row to render and the drawer to enter the screen.
    const timer = setTimeout(() => focusRef.current?.requestTVFocus?.(), CHANNEL_DRAWER_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const activate = useCallback(() => {
    const current = latest.current;
    if (current.failed) {
      setRetry(value => value + 1);
      return;
    }
    const selected = current.channels[current.index];
    if (selected) {
      current.onSelectChannel(selected);
    }
  }, []);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }
    const current = latest.current;
    const direction =
      event.eventType === 'up' ? -1 : event.eventType === 'down' ? 1 : 0;
    if (!direction || !current.channels.length) {
      return;
    }
    const next = Math.max(
      0,
      Math.min(current.channels.length - 1, current.index + direction),
    );
    if (next !== current.index) {
      playFocusSound();
      setIndex(next);
    }
  });

  const playingIndex = playingChannelIndex(channels, item);
  const visibleCount = Math.max(
    1,
    1 + Math.floor((height - ACTIVE_ROW_HEIGHT) / ROW_HEIGHT),
  );
  const first = Math.max(
    0,
    Math.min(
      index - Math.floor(visibleCount / 2),
      channels.length - visibleCount,
    ),
  );
  return (
    <View testID="live-channel-drawer" style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        focusable={false}
        accessible={false}
        onPress={onClose}
      />
      <Animated.View style={[styles.panel, {
        width: drawerWidth,
        opacity: entrance,
        transform: [{translateX: entrance.interpolate({inputRange: [0, 1], outputRange: [-drawerWidth - PLAYER_PANEL_INSET, 0]})}],
      }]}>
      <TVFocusGuideView
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        style={styles.panelContent}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>{t('playerChannels')}</Text>
          <Text style={styles.count}>{channels.length || ''}</Text>
          <Pressable
            focusable={false}
            accessibilityLabel={t('close')}
            onPress={onClose}
            style={styles.close}
          >
            <Image
              source={require('../../assets/icons/close.png')}
              style={styles.closeIcon}
            />
          </Pressable>
        </View>
        <View
          style={styles.list}
          onLayout={event => setHeight(event.nativeEvent.layout.height)}
        >
          <Pressable
            ref={focusRef}
            testID="live-channel-drawer-focus"
            hasTVPreferredFocus={!loading}
            focusable
            accessibilityLabel={
              failed
                ? t('vodRetry')
                : channels[index]?.channelName || t('playerChannels')
            }
            onPress={activate}
            onFocus={() => setListFocused(true)}
            onBlur={() => setListFocused(false)}
            style={styles.focusAnchor}
          />
          {loading ? (
            <Text style={styles.message}>{t('playerSourceConnecting')}</Text>
          ) : failed ? (
            <Text style={styles.error}>
              {t('playerChannelsUnavailable')} · {t('vodRetry')}
            </Text>
          ) : !channels.length ? (
            <Text style={styles.message}>{t('guideEmpty')}</Text>
          ) : (
            channels
              .slice(first, first + visibleCount)
              .map((channel, offset) => {
                const selected = first + offset === index;
                const playing = first + offset === playingIndex;
                return (
                  <Pressable
                    key={channel.id}
                    testID={`drawer-channel-${channel.id}`}
                    focusable={false}
                    accessibilityState={{ selected, checked: playing }}
                    onPress={() => {
                      const current = latest.current;
                      const target = current.channels.find(
                        candidate => candidate.id === channel.id,
                      );
                      if (target) {
                        current.onSelectChannel(target);
                      }
                    }}
                    style={[
                      styles.row,
                      selected && styles.expanded,
                      selected && listFocused && styles.focused,
                    ]}
                  >
                    <View style={styles.channelInfo}>
                      {channel.fallbackImageUrl ? (
                        <RemoteImage
                          uri={channel.fallbackImageUrl}
                          resizeMode="contain"
                          style={styles.logo}
                        />
                      ) : (
                        <View style={styles.logo} />
                      )}
                      <Text numberOfLines={1} style={styles.number}>
                        {channel.channelNumber}
                      </Text>
                      <View style={styles.metadata}>
                        <Text numberOfLines={1} style={styles.name}>
                          {channel.channelName || channel.title}
                        </Text>
                        {!selected ? (
                          <Text numberOfLines={1} style={styles.program}>
                            {switchingChannelId === channel.id
                              ? t('playerSourceConnecting')
                              : channel.title}
                          </Text>
                        ) : null}
                      </View>
                      {playing ? (
                        <View
                          testID="drawer-playing-channel"
                          style={styles.playing}
                        />
                      ) : null}
                    </View>
                    {selected ? (
                      <View style={styles.preview}>
                        {channel.backdropUrl || channel.imageUrl ? (
                          <RemoteImage
                            testID="drawer-active-program-image"
                            uri={channel.backdropUrl || channel.imageUrl!}
                            fallbackUri={channel.fallbackImageUrl}
                            resizeMode="cover"
                            style={styles.programImage}
                          />
                        ) : (
                          <View style={styles.programImage} />
                        )}
                        <Text numberOfLines={2} style={styles.activeProgram}>
                          {switchingChannelId === channel.id
                            ? t('playerSourceConnecting')
                            : channel.title}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
          )}
        </View>
        {error ? (
          <Text testID="drawer-channel-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </TVFocusGuideView>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    paddingLeft: PLAYER_PANEL_INSET,
    paddingVertical: PLAYER_PANEL_VERTICAL_INSET,
  },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: 'rgba(10, 14, 20, 0.80)',
    overflow: 'hidden',
  },
  panelContent: {
    flex: 1,
    padding: 16,
  },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { color: '#ffffff', fontSize: 18, fontWeight: '700', flex: 1 },
  count: { color: '#9eabb4', fontSize: 12 },
  close: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { width: 16, height: 16, tintColor: '#ffffff' },
  list: { flex: 1, overflow: 'hidden' },
  focusAnchor: { ...StyleSheet.absoluteFillObject, opacity: 0.01, zIndex: 1 },
  row: {
    zIndex: 2,
    height: ROW_HEIGHT,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  channelInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expanded: { height: ACTIVE_ROW_HEIGHT },
  focused: {
    backgroundColor: '#34474a',
    borderColor: '#ffffff',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  programImage: {
    width: 96,
    height: 54,
    borderRadius: 6,
    backgroundColor: '#182125',
  },
  activeProgram: { flex: 1, color: '#ffffff', fontSize: 12, lineHeight: 17 },
  logo: { width: 32, height: 30 },
  number: { width: 35, color: '#ffffff', fontSize: 13, fontWeight: '700' },
  metadata: { flex: 1, minWidth: 0 },
  name: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  program: { color: '#aab9c1', fontSize: 11, marginTop: 3 },
  playing: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#7fb7bc' },
  message: { color: '#d7e0e5', fontSize: 14, marginTop: 16 },
  error: {
    color: '#ffb4b9',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 10,
  },
});
