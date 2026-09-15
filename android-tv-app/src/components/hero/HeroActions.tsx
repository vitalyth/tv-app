import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { HeroActionButton } from './HeroActionButton';

interface HeroActionsProps {
  hasActivePlayer?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onOpenFullScreen?: () => void;
  customActions?: ReactNode;
}

export const HeroActions: React.FC<HeroActionsProps> = React.memo(({
  hasActivePlayer = true,
  isMuted = false,
  onToggleMute,
  onOpenFullScreen,
  customActions,
}) => {
  if (customActions) {
    return <View style={styles.container}>{customActions}</View>;
  }

  if (!hasActivePlayer) {
    return null;
  }

  return (
    <View style={styles.container}>
      {onOpenFullScreen && (
        <HeroActionButton
          iconName="fullscreen"
          onPress={onOpenFullScreen}
          label="מסך מלא"
        />
      )}
      {onToggleMute && (
        <HeroActionButton
          iconName={isMuted ? 'volume-off' : 'volume-up'}
          onPress={onToggleMute}
          label={isMuted ? 'הפעל קול' : 'השתק'}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default HeroActions;
