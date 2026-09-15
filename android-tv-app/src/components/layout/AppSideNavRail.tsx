import React, { useState, useEffect } from 'react';
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
  const blurTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isExpanded = focusedKey !== null && !forceCollapsed;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  // When rail is focused, pressing RIGHT returns focus to the screen content
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onTvRemoteKey', ({ keyCode }: { keyCode: number }) => {
      if (keyCode === 22 && focusedKey !== null) {
        if (blurTimerRef.current) {
          clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }
        setFocusedKey(null);
        onExpandedChanged?.(false);
        onReturnFocusToScreen?.();
      }
    });
    return () => sub.remove();
  }, [focusedKey, onExpandedChanged, onReturnFocusToScreen]);

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
          return null;
        }
        return prev;
      });
      onExpandedChanged?.(false);
    }, 80);
  };

  const handleSelect = (dest: AppDestination) => {
    // 1. Instantly collapse the rail
    setForceCollapsed(true);
    setFocusedKey(null);
    onExpandedChanged?.(false);

    // 2. Select destination
    onDestinationSelected(dest);

    // 3. Reset force-collapse after navigation completes
    setTimeout(() => {
      setForceCollapsed(false);
    }, 500);
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
          hasTVPreferredFocus={focusDestination === AppDestination.HOME}
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
          hasTVPreferredFocus={focusDestination === AppDestination.LIVE_TV}
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
          hasTVPreferredFocus={focusDestination === AppDestination.VOD}
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
    backgroundColor: 'rgba(8, 10, 13, 0.65)', // Soft translucent over background player
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(10, 14, 23, 0.80)',
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
