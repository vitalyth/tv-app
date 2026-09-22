import { useEffect, useReducer, useRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { getRoute, type RootRoute } from '../navigation/routes';
import { initialShellState, shellReducer } from '../navigation/shellState';
import { tvPlatform } from '../platform/runtime';
import { IntroRegion } from './IntroRegion';
import { MediaLayer } from './MediaLayer';
import { PageContent, type PageContentHandle } from './PageContent';
import { SideMenu } from './SideMenu';

export function ApplicationShell() {
  const [state, dispatch] = useReducer(shellReducer, initialShellState);
  const pageContentRef = useRef<PageContentHandle>(null);
  const activeRoute = getRoute(state.activeRoute);

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

  const selectRoute = (route: RootRoute) => {
    dispatch({ type: 'select-route', route });
    dispatch({ type: 'collapse-menu' });
    requestAnimationFrame(() => pageContentRef.current?.focusFirst());
  };

  return (
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
            onContentFocus={() => dispatch({ type: 'focus-content' })}
          />
        </View>
        <SideMenu
          activeRoute={state.activeRoute}
          expanded={state.menuExpanded}
          onFocus={() => dispatch({ type: 'focus-menu' })}
          onSelectRoute={selectRoute}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07111c' },
  overlay: { flex: 1 },
  mainArea: { flex: 1, paddingLeft: 116, paddingRight: 44, paddingTop: 24 },
  topBar: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  platform: { color: '#8da1b2', fontSize: 13, fontWeight: '600' },
  clock: { color: '#dce7ef', fontSize: 20 },
});
