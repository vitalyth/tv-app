import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { MediaControllerProvider } from '../media/MediaController';
import { PageContent, type PageContentHandle } from './PageContent';
import { SideMenu } from './SideMenu';

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
    (interval as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(interval);
  }, []);

  return <Text style={styles.clock}>{time}</Text>;
});

export function ApplicationShell() {
  const [state, dispatch] = useReducer(shellReducer, initialShellState);
  const [menuFocusDestination, setMenuFocusDestination] =
    useState<FocusDestination>(null);
  const [focusedMediaItem, setFocusedMediaItem] = useState<MediaItem | null>(
    null,
  );
  const pageContentRef = useRef<PageContentHandle>(null);
  const activeRoute = getRoute(state.activeRoute);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1) {
      return;
    }

    if (event.eventType === 'right' && state.menuExpanded) {
      dispatch({ type: 'collapse-menu' });
      pageContentRef.current?.restoreFocus();
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
        pageContentRef.current?.restoreFocus();
        return true;
      },
    );
    return () => subscription.remove();
  }, [state.menuExpanded]);

  const selectRoute = useCallback((route: RootRoute) => {
    setFocusedMediaItem(null);
    dispatch({ type: 'select-route', route });
    pageContentRef.current?.focusFirst();
  }, []);

  const handleMenuFocus = useCallback(() => {
    dispatch({ type: 'focus-menu' });
  }, []);

  const handleContentFocus = useCallback(() => {
    dispatch({ type: 'focus-content' });
  }, []);

  return (
    <MediaControllerProvider>
      <View style={styles.screen}>
        <MediaLayer />
        <View style={styles.overlay}>
          <View style={styles.mainArea}>
            <View style={styles.topBar}>
              <Text style={styles.platform}>{tvPlatform.displayName}</Text>
              <LiveClock />
            </View>
            <IntroRegion route={activeRoute} focusedItem={focusedMediaItem} />
            <PageContent
              ref={pageContentRef}
              route={activeRoute}
              active={!state.menuExpanded}
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
      </View>
    </MediaControllerProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07111c' },
  overlay: { flex: 1 },
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

