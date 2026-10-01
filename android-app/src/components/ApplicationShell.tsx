import {
  memo,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  useTVEventHandler,
  View,
  type FocusDestination,
  type View as ViewType,
} from 'react-native';
import { getRoute, type RootRoute } from '../navigation/routes';
import { initialShellState, shellReducer } from '../navigation/shellState';
import { tvPlatform } from '../platform/runtime';
import {
  MAIN_CONTENT_INSET_LEFT,
  MAIN_CONTENT_INSET_RIGHT,
} from '../theme/layout';
import { IntroRegion } from './IntroRegion';
import { MediaLayer } from './MediaLayer';
import type { MediaItem } from '../media/player';
import {
  MediaControllerProvider,
  useMediaActions,
  useMediaController,
} from '../media/MediaController';
import { PageContent, type PageContentHandle } from './PageContent';
import { SideMenu } from './SideMenu';
import { FullScreenPlayer } from './player/FullScreenPlayer';

function getFormattedTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const LiveClock = memo(function LiveClockView() {
  const [time, setTime] = useState(getFormattedTime);

  useEffect(() => {
    const update = () => setTime(getFormattedTime());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return <Text style={styles.clock}>{time}</Text>;
});

const MENU_FOCUS_RESTORE_DELAY_MS = 160;

function ShellContent({
  state,
  dispatch,
  menuFocusDestination,
  setMenuFocusDestination,
  focusedMediaItem,
  setFocusedMediaItem,
  pageContentRef,
}: {
  state: ReturnType<typeof shellReducer> extends never ? never : any;
  dispatch: React.Dispatch<any>;
  menuFocusDestination: FocusDestination;
  setMenuFocusDestination: (dest: FocusDestination) => void;
  focusedMediaItem: MediaItem | null;
  setFocusedMediaItem: (item: MediaItem | null) => void;
  pageContentRef: React.RefObject<PageContentHandle | null>;
}) {
  const { item: playingItem, presentation } = useMediaController();
  const { exitFullscreen } = useMediaActions();
  const activeRoute = getRoute(state.activeRoute);
  const isFullscreen = presentation === 'fullscreen';
  const focusRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleContentFocus = useCallback(
    (itemId?: string, delay = MENU_FOCUS_RESTORE_DELAY_MS) => {
      if (focusRestoreTimerRef.current) {
        clearTimeout(focusRestoreTimerRef.current);
      }
      focusRestoreTimerRef.current = setTimeout(() => {
        focusRestoreTimerRef.current = null;
        pageContentRef.current?.restoreFocus(itemId);
      }, delay);
    },
    [pageContentRef],
  );

  useEffect(
    () => () => {
      if (focusRestoreTimerRef.current) {
        clearTimeout(focusRestoreTimerRef.current);
      }
    },
    [],
  );

  const handleExitFullscreen = useCallback(() => {
    // Exit fullscreen first so the overlay becomes focusable (pointerEvents re-enabled)
    exitFullscreen();
    // Then restore focus to the exact card that opened the player.
    scheduleContentFocus(playingItem?.id, 50);
  }, [exitFullscreen, playingItem?.id, scheduleContentFocus]);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }

    if (event.eventType === 'right' && state.menuExpanded) {
      dispatch({ type: 'collapse-menu' });
      scheduleContentFocus();
      return;
    }

    if (
      event.eventType === 'left' &&
      !state.menuExpanded &&
      pageContentRef.current?.canExitToMenu()
    ) {
      dispatch({ type: 'focus-menu' });
      const destination = menuFocusDestination as
        | (ViewType & { requestTVFocus?: () => void })
        | null;
      destination?.requestTVFocus?.();
    }
  });

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!state.menuExpanded) {
          return false;
        }
        dispatch({ type: 'collapse-menu' });
        scheduleContentFocus();
        return true;
      },
    );
    return () => subscription.remove();
  }, [state.menuExpanded, dispatch, scheduleContentFocus]);

  const selectRoute = useCallback(
    (route: RootRoute) => {
      setFocusedMediaItem(null);
      dispatch({ type: 'select-route', route });
      pageContentRef.current?.focusFirst();
    },
    [dispatch, setFocusedMediaItem, pageContentRef],
  );

  const handleMenuFocus = useCallback(() => {
    dispatch({ type: 'focus-menu' });
  }, [dispatch]);

  const handleContentFocus = useCallback(() => {
    dispatch({ type: 'focus-content' });
  }, [dispatch]);

  return (
    <View style={styles.screen}>
      <MediaLayer />
      <View
        accessibilityElementsHidden={isFullscreen}
        importantForAccessibility={isFullscreen ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isFullscreen ? 'none' : 'auto'}
        style={[styles.overlay, isFullscreen && styles.overlayHidden]}
      >
          <View style={styles.mainArea}>
            <View style={styles.topBar}>
              <Text style={styles.platform}>{tvPlatform.displayName}</Text>
              <LiveClock />
            </View>
            <IntroRegion route={activeRoute} focusedItem={focusedMediaItem} />
            <PageContent
              ref={pageContentRef}
              route={activeRoute}
              active={!isFullscreen && !state.menuExpanded}
              menuFocusDestination={menuFocusDestination}
              onContentFocus={handleContentFocus}
              onItemFocused={setFocusedMediaItem}
            />
          </View>
          <SideMenu
            activeRoute={state.activeRoute}
            expanded={state.menuExpanded}
            onFocus={handleMenuFocus}
            onActiveItemChange={setMenuFocusDestination}
            onSelectRoute={selectRoute}
          />
      </View>
      {/* FullScreenPlayer AFTER overlay so it renders on top (React Native z-order) */}
      {isFullscreen ? (
        <View style={StyleSheet.absoluteFill}>
          <FullScreenPlayer onExit={handleExitFullscreen} />
        </View>
      ) : null}
    </View>
  );
}

export function ApplicationShell() {
  const [state, dispatch] = useReducer(shellReducer, initialShellState);
  const [menuFocusDestination, setMenuFocusDestination] =
    useState<FocusDestination>(null);
  const [focusedMediaItem, setFocusedMediaItem] = useState<MediaItem | null>(
    null,
  );
  const pageContentRef = useRef<PageContentHandle>(null);

  return (
    <MediaControllerProvider>
      <ShellContent
        state={state}
        dispatch={dispatch}
        menuFocusDestination={menuFocusDestination}
        setMenuFocusDestination={setMenuFocusDestination}
        focusedMediaItem={focusedMediaItem}
        setFocusedMediaItem={setFocusedMediaItem}
        pageContentRef={pageContentRef}
      />
    </MediaControllerProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07111c' },
  overlay: { flex: 1 },
  overlayHidden: { opacity: 0 },
  mainArea: {
    flex: 1,
    paddingLeft: MAIN_CONTENT_INSET_LEFT,
    paddingRight: MAIN_CONTENT_INSET_RIGHT,
    paddingTop: 8,
  },
  topBar: {
    height: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  platform: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  clock: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
