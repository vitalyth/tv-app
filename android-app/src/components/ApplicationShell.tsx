import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { MediaControllerProvider } from '../media/MediaController';
import { PageContent, type PageContentHandle } from './PageContent';
import { SideMenu } from './SideMenu';

export function ApplicationShell() {
  const [state, dispatch] = useReducer(shellReducer, initialShellState);
  const [menuFocusDestination, setMenuFocusDestination] =
    useState<FocusDestination>(null);
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
              <Text style={styles.clock}>20:45</Text>
            </View>
            <IntroRegion route={activeRoute} />
            <PageContent
              ref={pageContentRef}
              route={activeRoute}
              active={!state.menuExpanded}
              menuFocusDestination={menuFocusDestination}
              onContentFocus={handleContentFocus}
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
    paddingTop: 24,
  },
  topBar: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  platform: { color: '#8da1b2', fontSize: 13, fontWeight: '600' },
  clock: { color: '#dce7ef', fontSize: 20 },
});
