import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, DeviceEventEmitter } from 'react-native';
import { NavRailItem } from './NavRailItem';
import { AppDestination } from '../../types/guide';

interface AppSideNavRailProps {
  currentDestination: AppDestination;
  onDestinationSelected: (destination: AppDestination) => void;
  onExpandedChanged?: (expanded: boolean) => void;
  onReturnFocusToScreen?: () => void;
  focusDestination?: AppDestination | null;
  focusNonce?: number;
}

export const AppSideNavRail: React.FC<AppSideNavRailProps> = ({
  currentDestination,
  onDestinationSelected,
  onExpandedChanged,
  onReturnFocusToScreen,
  focusDestination,
  focusNonce = 0,
}) => {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [forceCollapsed, setForceCollapsed] = useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExpanded = focusedKey !== null && !forceCollapsed;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  // When focus is requested from a screen (e.g. DPAD_LEFT at start of row)
  useEffect(() => {
    if (focusNonce && focusNonce > 0) {
      setForceCollapsed(false);
      const targetKey =
        focusDestination === AppDestination.LIVE_TV
          ? 'live'
          : focusDestination === AppDestination.VOD
          ? 'vod'
          : 'home';
      setFocusedKey(targetKey);
      onExpandedChanged?.(true);
    }
  }, [focusNonce, focusDestination, onExpandedChanged]);

  const lastSelectTimeRef = React.useRef(0);

  const handleSelect = useCallback(
    (dest: AppDestination) => {
      const now = Date.now();
      if (now - lastSelectTimeRef.current < 400) return;
      lastSelectTimeRef.current = now;

      // 1. Instantly collapse the rail
      setForceCollapsed(true);
      setFocusedKey(null);
      onExpandedChanged?.(false);
      onReturnFocusToScreen?.();

      // 2. Select destination
      onDestinationSelected(dest);

      // Re-enable rail expansion after short transition
      setTimeout(() => {
        setForceCollapsed(false);
      }, 400);
    },
    [onDestinationSelected, onExpandedChanged, onReturnFocusToScreen]
  );

  // Remote key navigation in Side Rail
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onTvRemoteKey', ({ keyCode }: { keyCode: number }) => {
      if (!isExpanded && !focusedKey) return;

      if (keyCode === 22) {
        // RIGHT: return focus to screen
        if (blurTimerRef.current) {
          clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }
        setFocusedKey(null);
        onExpandedChanged?.(false);
        onReturnFocusToScreen?.();
      } else if (keyCode === 19) {
        // UP: cycle up through rail items
        setFocusedKey((prev) => {
          if (prev === 'vod') return 'live';
          if (prev === 'live') return 'home';
          return 'home';
        });
      } else if (keyCode === 20) {
        // DOWN: cycle down through rail items
        setFocusedKey((prev) => {
          if (prev === 'home') return 'live';
          if (prev === 'live') return 'vod';
          return 'vod';
        });
      } else if (keyCode === 23 || keyCode === 66 || keyCode === 160) {
        // ENTER: select destination
        const key = focusedKey || (currentDestination === AppDestination.HOME ? 'home' : currentDestination === AppDestination.LIVE_TV ? 'live' : 'vod');
        if (key === 'home') handleSelect(AppDestination.HOME);
        else if (key === 'live') handleSelect(AppDestination.LIVE_TV);
        else if (key === 'vod') handleSelect(AppDestination.VOD);
      }
    });
    return () => sub.remove();
  }, [isExpanded, focusedKey, onExpandedChanged, onReturnFocusToScreen, handleSelect, currentDestination]);

  const handleFocus = (key: string) => {
    if (forceCollapsed) return;
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setFocusedKey(key);
    onExpandedChanged?.(true);
  };

  const handleBlur = (key: string) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      setFocusedKey((prev) => {
        if (prev === key) {
          onExpandedChanged?.(false);
          return null;
        }
        return prev;
      });
    }, 120);
  };

  return (
    <View style={[styles.rail, isExpanded ? styles.railExpanded : styles.railCollapsed]}>
      <View style={styles.itemsColumn}>
        <NavRailItem
          destination={AppDestination.HOME}
          iconName="home"
          label="Home"
          isSelected={currentDestination === AppDestination.HOME}
          isRailExpanded={isExpanded}
          isForcedFocused={focusedKey === 'home'}
          hasTVPreferredFocus={focusDestination === AppDestination.HOME && focusNonce > 0}
          focusNonce={focusDestination === AppDestination.HOME ? focusNonce : 0}
          onSelect={() => handleSelect(AppDestination.HOME)}
          onFocus={() => handleFocus('home')}
          onBlur={() => handleBlur('home')}
        />

        <NavRailItem
          destination={AppDestination.LIVE_TV}
          iconName="live"
          label="Live"
          isSelected={currentDestination === AppDestination.LIVE_TV}
          isRailExpanded={isExpanded}
          isForcedFocused={focusedKey === 'live'}
          hasTVPreferredFocus={focusDestination === AppDestination.LIVE_TV && focusNonce > 0}
          focusNonce={focusDestination === AppDestination.LIVE_TV ? focusNonce : 0}
          onSelect={() => handleSelect(AppDestination.LIVE_TV)}
          onFocus={() => handleFocus('live')}
          onBlur={() => handleBlur('live')}
        />

        <NavRailItem
          destination={AppDestination.VOD}
          iconName="vod"
          label="VOD"
          isSelected={currentDestination === AppDestination.VOD}
          isRailExpanded={isExpanded}
          isForcedFocused={focusedKey === 'vod'}
          hasTVPreferredFocus={focusDestination === AppDestination.VOD && focusNonce > 0}
          focusNonce={focusDestination === AppDestination.VOD ? focusNonce : 0}
          onSelect={() => handleSelect(AppDestination.VOD)}
          onFocus={() => handleFocus('vod')}
          onBlur={() => handleBlur('vod')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    backgroundColor: 'rgba(8, 10, 13, 0.98)',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  railCollapsed: {
    width: 56,
  },
  railExpanded: {
    width: 176,
    backgroundColor: 'rgba(10, 14, 23, 0.97)',
    shadowColor: '#000000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 16,
  },
  itemsColumn: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
});

export default AppSideNavRail;
