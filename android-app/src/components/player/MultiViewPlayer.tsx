import {useTVNavigationEventHandler} from '../../hooks/useTVNavigationEventHandler';
import {liveEpgStore} from '../../state/liveEpg';
import {useChannelDrawerViewport} from '../../hooks/useChannelDrawerViewport';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
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
  multiViewToolbarLayout,
  multiViewFocusLayout,
} from '../../media/multiViewLayout';
import { isSameMediaItem, type MediaItem } from '../../media/player';
import { tvPlatform } from '../../platform/runtime';
import { t } from '../../i18n';
import { RemoteImage } from '../RemoteImage';
import { LiveChannelDrawer } from './LiveChannelDrawer';
import { softwareMultiViewAvailable } from '../../media/nativeMultiView';
import {PlayerTopInfo} from './PlayerTopInfo';
import {PlayerBottomControls, type ControlId} from './PlayerBottomControls';
import {QualityDialog} from './QualityDialog';
import {SubtitleDialog} from './SubtitleDialog';
import {SourceDialog} from './SourceDialog';
import {multiViewSessionKey, useMultiViewPlayback} from '../../media/multiViewSessions';
import {getLiveChannelSourceOptions, selectLiveChannelSource} from '../../api/channels';
import {MultiViewTileFrame} from './MultiViewTileFrame';

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
  const tile = controller.multiView?.activeTile ?? 0;
  const setTile = media.setMultiViewActiveTile;
  const activeTile = Math.min(tile, count - 1);
  const [navigationTile, setNavigationTile] = useState<number | null>(null);
  const smallTiles = Array.from({length: count}, (_, index) => index).filter(index => index !== activeTile);
  const focusedTile = smallTiles.includes(navigationTile ?? -1) ? navigationTile! : smallTiles[0] ?? activeTile;
  const [activeFocused, setActiveFocused] = useState(false);
  const [activePanelsVisible, setActivePanelsVisible] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'quality' | 'sources' | 'subtitles' | null>(null);
  const [panelControl, setPanelControl] = useState<ControlId>('play-pause');
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
  const actionButtons = useRef<Partial<Record<Action, View & {requestTVFocus?: () => void}>>>({});
  const activeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelsVisibleRef = useRef(false);
  const panelsRevealedAt = useRef(0);
  const clearActiveHideTimer = useCallback(() => {
    if (activeHideTimer.current !== null) clearTimeout(activeHideTimer.current);
    activeHideTimer.current = null;
  }, []);
  const showActivePanels = useCallback(() => {
    if (!panelsVisibleRef.current) panelsRevealedAt.current = Date.now();
    panelsVisibleRef.current = true;
    setActivePanelsVisible(true);
    clearActiveHideTimer();
    activeHideTimer.current = setTimeout(() => {
      activeHideTimer.current = null;
      panelsVisibleRef.current = false;
      setActivePanelsVisible(false);
    }, PANELS_HIDE_DELAY_MS);
  }, [clearActiveHideTimer]);
  const focusActivePlayer = useCallback(() => {
    clearActiveHideTimer();
    panelsVisibleRef.current = false;
    setActivePanelsVisible(false);
    setAction(null);
    setActiveFocused(true);
    setPanelControl('play-pause');
  }, [clearActiveHideTimer]);
  const focusPanelControl = useCallback((id: ControlId) => {
    setPanelControl(id);
    showActivePanels();
  }, [showActivePanels]);
  const interactWithPanel = (handler: () => void) => {
    // A Select that reveals controls must not also activate the newly focused button.
    if (Date.now() - panelsRevealedAt.current < 350) return;
    handler();
    showActivePanels();
  };
  useEffect(() => {
    if (activeFocused && !activeDialog && !picker && panelsVisibleRef.current) showActivePanels();
    else clearActiveHideTimer();
    return clearActiveHideTimer;
  }, [activeFocused, activeDialog, picker, activeTile, showActivePanels, clearActiveHideTimer]);
  const actions: Action[] = [
    'fullscreen',
    ...(count < maxStreams ? ['add' as const] : []),
    'change',
    ...(count > 1 ? ['remove' as const] : []),
    ...(softwareMultiViewAvailable && count <= 2 ? ['backend' as const] : []),
  ];
  const selected =
    activeTile === 0
      ? controller.item
      : controller.multiView?.tiles[activeTile - 1]?.item;
  useEffect(() => {
    setInfoVisible(true);
    const timer = setTimeout(() => setInfoVisible(false), PANELS_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focusedTile, activeTile, activeFocused, selected?.id]);
  const selectedStatus =
    activeTile === 0
      ? controller.status
      : controller.multiView?.tiles[activeTile - 1]?.status;
  const latest = useRef({
    controller,
    media,
    tile: activeTile,
    focusedTile,
    smallTiles,
    activeFocused,
    activePanelsVisible,
    activeDialog,
    panelControl,
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
    tile: activeTile,
    focusedTile,
    smallTiles,
    activeFocused,
    activePanelsVisible,
    activeDialog,
    panelControl,
    action,
    picker,
    count,
    actions,
    selected,
    selectedStatus,
  };

  const audioTile = activeFocused || action || picker ? activeTile : focusedTile;
  const audioStatus = audioTile === 0 ? controller.status : controller.multiView?.tiles[audioTile - 1]?.status;
  const desiredAudioTile = audioStatus === 'playing' ? audioTile : -1;
  const currentAudioTile = controller.multiView?.audioTile ?? -1;
  useEffect(() => {
    if (currentAudioTile !== desiredAudioTile) setMultiViewAudio(desiredAudioTile);
  }, [desiredAudioTile, currentAudioTile, setMultiViewAudio]);

  const closePicker = useCallback(() => {
    request.current += 1;
    lastInteraction.current = Date.now();
    setPicker(null);
    setActiveFocused(false);
    setAction(null);
    setResolving(undefined);
    setError(undefined);
  }, []);
  useEffect(() => {
    if (!picker) {
      const timer = setTimeout(() => {
        if (action) actionButtons.current[action]?.requestTVFocus?.();
        else if (!activeFocused) anchor.current?.requestTVFocus?.();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [picker, action, activeFocused]);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
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
    setActiveFocused(false);
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
        setNavigationTile(current.tile);
        closePicker();
        focusActivePlayer();
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
        setNavigationTile(current.tile);
        closePicker();
        focusActivePlayer();
      } catch {
        if (sequence === request.current) {
          setResolving(undefined);
          setError(t('playerChannelUnavailable'));
        }
      }
    },
    [closePicker, focusActivePlayer],
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
            // This decoder is already playing and survives the role change.
            current.media.markPlaying();
          }
        }
      } else if (command === 'remove' && current.count > 1) {
        current.media.removeMultiViewChannel(current.tile);
        setTile(0);
        setNavigationTile(null);
        focusActivePlayer();
      }
    },
    [openPicker, focusActivePlayer],
  );
  const activate = useCallback(() => {
    const current = latest.current;
    if (current.picker || Date.now() - lastInteraction.current < 350) {
      return;
    }
    if (current.activeFocused || current.activeDialog) return;
    if (current.action !== null) {
      runAction(current.action);
    } else if (current.smallTiles.length) {
      setTile(current.focusedTile);
      setNavigationTile(current.tile);
      focusActivePlayer();
    }
  }, [runAction, focusActivePlayer]);

  useTVNavigationEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }
    const current = latest.current;
    const panelInteraction = ['up', 'down', 'left', 'right', 'select', 'longSelect', 'enter',
      'info', 'playpause', 'playPause', 'play', 'pause', 'rewind', 'fastForward'].includes(event.eventType);
    if (current.activeFocused && !current.activeDialog && !current.picker && panelInteraction) {
      if (current.activePanelsVisible) showActivePanels();
      else if (['select', 'longSelect', 'enter'].includes(event.eventType)) {
        showActivePanels();
        return;
      }
    }
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
    if (current.activeDialog) return;
    if (current.activeFocused) {
      if (!current.activePanelsVisible) {
        if (event.eventType === 'right' && current.smallTiles.length) setActiveFocused(false);
        else if (event.eventType === 'down') {
          setActiveFocused(false);
          setAction('fullscreen');
        }
        return;
      }
      // Inner player controls own Left/Right and timeline navigation.
      if (event.eventType === 'down' && current.panelControl !== 'timeline') {
        setActiveFocused(false);
        setAction('fullscreen');
      } else if (event.eventType === 'up' && current.panelControl === 'timeline') {
        setActiveFocused(false);
        setNavigationTile(current.smallTiles[0] ?? null);
      }
      return;
    }
    if (event.eventType === 'left' || event.eventType === 'right') {
      if (current.action) {
        const index = current.actions.indexOf(current.action);
        const direction = event.eventType === 'left' ? -1 : 1;
        setAction(current.actions[(index + direction + current.actions.length) % current.actions.length]);
      }
      else if (event.eventType === 'left') {
        focusActivePlayer();
      }
      // Horizontal arrows never open the picker or select the large player.
      return;
    }
    if (event.eventType === 'up' || event.eventType === 'down') {
      if (current.action) {
        if (event.eventType === 'up') {
          focusActivePlayer();
        }
      } else {
        const index = current.smallTiles.indexOf(current.focusedTile);
        if (event.eventType === 'up' && index <= 0) {
          focusActivePlayer();
        } else if (event.eventType === 'down' && index >= current.smallTiles.length - 1) {
          setAction('fullscreen');
        } else {
          const next = Math.max(0, index + (event.eventType === 'up' ? -1 : 1));
          setNavigationTile(current.smallTiles[next] ?? null);
        }
      }
    }
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (latest.current.activeDialog) {
          request.current += 1;
          setResolving(undefined);
          setError(undefined);
          setActiveDialog(null);
        } else if (latest.current.activeFocused) {
          setActiveFocused(false);
          setAction('fullscreen');
        } else if (latest.current.picker) {
          closePicker();
        } else {
          latest.current.media.exitMultiView();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [closePicker]);

  const activeStream = activeTile === 0 ? controller.stream : controller.multiView?.tiles[activeTile - 1]?.stream;
  const playback = useMultiViewPlayback(activeFocused && activePanelsVisible && selected && activeStream ? multiViewSessionKey(selected, activeStream) : '');
  const sourceOptions = useMemo(() => selected ? getLiveChannelSourceOptions(selected, activeStream?.sourceId) : [], [selected, activeStream?.sourceId]);
  const changeSource = async (sourceId: string) => {
    if (!selected) return;
    const source = selectLiveChannelSource(selected, sourceId);
    if (!source) return;
    const sequence = ++request.current;
    setResolving(sourceId);
    setError(undefined);
    try {
      const stream = await resolveLiveChannelStream(source, {useSavedSource: false});
      if (sequence !== request.current) return;
      if (activeTile === 0) media.setMultiViewPrimary(selected, stream);
      else media.setMultiViewChannel(selected, stream, activeTile);
      setActiveDialog(null);
    } catch {
      if (sequence === request.current) setError(t('playerChannelUnavailable'));
    } finally {
      if (sequence === request.current) setResolving(undefined);
    }
  };

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
        focusable={!picker && !action && !activeFocused && !activeDialog}
        accessibilityLabel={
          action ? labels[action] : (focusedTile === 0 ? controller.item : controller.multiView?.tiles[focusedTile - 1]?.item)?.channelName
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
        <MultiViewTileFrame
          key={entry.item.id}
          index={index} count={count} activeTile={activeTile} width={width} height={height}
          animateFocus={controller.multiView?.backend !== 'software'}
          testID={`multiview-tile-${index}`}
          style={[
            styles.tile,
            !action && !activeDialog && (activeFocused ? index === activeTile : focusedTile === index && index !== activeTile) && styles.focused,
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            testID={`multiview-select-${index}`}
            focusable={false}
            accessibilityLabel={entry.item.channelName || entry.item.title}
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (index === activeTile) {
                setAction(null); setActiveFocused(true); setPanelControl('play-pause'); showActivePanels();
                return;
              }
              setTile(index);
              setNavigationTile(activeTile);
              focusActivePlayer();
            }}
          />
          {entry.status === 'loading' ? (
            <View testID={`multiview-placeholder-${index}`} pointerEvents="none" style={styles.placeholder}>
              <Text style={styles.state}>{t('playerSourceConnecting')}</Text>
            </View>
          ) : entry.status === 'error' ? (
            <View pointerEvents="none" style={styles.failure}>
              <Text style={styles.state}>{t('multiPlaybackError')}</Text>
            </View>
          ) : null}
          {infoVisible && !(index === activeTile && activeFocused) ? (
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


        </MultiViewTileFrame>
      ))}
          {activeFocused && !activeDialog && !picker ? (
            <View testID="multiview-active-panels" style={[multiViewFocusLayout(activeTile, count, width, height, activeTile), styles.activePanels]} pointerEvents="box-none">
              {infoVisible || activePanelsVisible ? <PlayerTopInfo item={selected || controller.item} /> : null}
              <View style={{flex: 1}} pointerEvents="none" />
              {activePanelsVisible ? <PlayerBottomControls
                item={selected || controller.item} paused={playback.paused}
                currentTime={playback.currentTime} duration={playback.duration}
                seekableStart={playback.seekableStart} seekableEnd={playback.seekableEnd}
                selectedQualityId={playback.selectedQualityId} videoQualities={playback.videoQualities}
                hasAlternateSources={sourceOptions.length > 1}
                hasSubtitles={controller.subtitleTracks.length > 0}
                onOpenSubtitles={() => interactWithPanel(() => setActiveDialog('subtitles'))}
                lastFocusedControl={panelControl} onFocusControl={focusPanelControl}
                onTogglePlayPause={() => interactWithPanel(playback.togglePaused)}
                onSeek={seconds => interactWithPanel(() => playback.seekTo(seconds))}
                onOpenQuality={() => interactWithPanel(() => setActiveDialog('quality'))}
                onOpenSources={() => interactWithPanel(() => {setError(undefined); setActiveDialog('sources');})}
              /> : null}
            </View>
          ) : null}

      {activeFocused && !activePanelsVisible && !activeDialog && !picker ? (
        <Pressable testID="multiview-active-activator" focusable hasTVPreferredFocus
          accessibilityLabel={selected?.channelName || selected?.title}
          style={[multiViewFocusLayout(activeTile, count, width, height, activeTile), styles.activePanels]}
          onPress={showActivePanels}
        />
      ) : null}
      {!picker ? (
            <View testID="multiview-toolbar" style={multiViewToolbarLayout(count, width, height, activeTile)}>
            <View style={styles.controls}>
              {actions.map(command => (
                <Pressable
                  key={command}
                  testID={`multiview-${command}`}
                  ref={node => {
                    if (node) actionButtons.current[command] = node;
                    else delete actionButtons.current[command];
                  }}
                  focusable={!activeFocused && !activeDialog && action === command}
                  onFocus={() => setAction(command)}
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
            </View>
          ) : null}
      </Animated.View>
      {activeDialog === 'quality' ? <QualityDialog
        qualities={playback.videoQualities.length ? playback.videoQualities : [{id: 'auto', label: 'Auto'}]}
        selectedQualityId={playback.selectedQualityId}
        onSelectQuality={playback.setQuality} onClose={() => setActiveDialog(null)}
      /> : null}
      {activeDialog === 'subtitles' ? <SubtitleDialog tracks={controller.subtitleTracks}
        selectedId={controller.selectedSubtitleId} onSelect={controller.setSelectedSubtitle}
        onClose={() => setActiveDialog(null)}
      /> : null}
      {activeDialog === 'sources' ? <SourceDialog sources={sourceOptions}
        channelLabel={selected?.channelName} switchingSourceId={resolving} error={error}
        onSelectSource={changeSource}
      /> : null}
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
    top: 8,
    left: 8,
    right: 8,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    padding: 6,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 14, 20, 0.80)',
  },
  logo: { width: 28, height: 28 },
  metadata: { flex: 1, minWidth: 0 },
  channel: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  program: { color: '#d2d7da', fontSize: 10, marginTop: 1 },
  controls: {
    alignSelf: 'center',
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
  activePanels: {position: 'absolute', borderRadius: 8, overflow: 'hidden', zIndex: 3},
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121b27',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failure: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#101619',
    justifyContent: 'center',
  },
});
