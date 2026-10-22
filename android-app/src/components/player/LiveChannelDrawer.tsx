import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  useTVEventHandler,
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

export const LiveChannelDrawer = memo(function LiveChannelDrawerView({
  item,
  loadChannels,
  switchingChannelId,
  error,
  onSelectChannel,
  onClose,
}: Props) {
  const [channels, setChannels] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(400);
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
        const selected = result.findIndex(channel =>
          isSameMediaItem(channel, latest.current.item),
        );
        setIndex(Math.max(0, selected));
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
    const timer = setTimeout(() => focusRef.current?.requestTVFocus?.(), 80);
    return () => clearTimeout(timer);
  }, []);

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
      <TVFocusGuideView
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        style={styles.panel}
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
            hasTVPreferredFocus
            focusable
            accessibilityLabel={
              failed
                ? t('vodRetry')
                : channels[index]?.channelName || t('playerChannels')
            }
            onPress={activate}
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
                const playing = isSameMediaItem(channel, item);
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
                      playing && styles.playingRow,
                      selected && styles.focused,
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
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  panel: {
    width: 336,
    maxWidth: '80%',
    height: '100%',
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 20,
    backgroundColor: 'rgba(12,16,20,0.97)',
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
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  channelInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playingRow: { backgroundColor: '#17383c', borderColor: '#25d4de' },
  focused: {
    height: ACTIVE_ROW_HEIGHT,
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
    borderRadius: 3,
    backgroundColor: '#182125',
  },
  activeProgram: { flex: 1, color: '#ffffff', fontSize: 12, lineHeight: 17 },
  logo: { width: 32, height: 30 },
  number: { width: 35, color: '#ffffff', fontSize: 13, fontWeight: '700' },
  metadata: { flex: 1, minWidth: 0 },
  name: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  program: { color: '#aab9c1', fontSize: 11, marginTop: 3 },
  playing: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#25d4de' },
  message: { color: '#d7e0e5', fontSize: 14, marginTop: 16 },
  error: {
    color: '#ffb4b9',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 10,
  },
});
