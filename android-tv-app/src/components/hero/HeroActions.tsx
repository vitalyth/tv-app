import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { HeroActionButton } from './HeroActionButton';

interface HeroActionsProps {
  hasActivePlayer?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onOpenFullScreen?: () => void;
  customActions?: ReactNode;
  focusTargetButton?: 'fullscreen' | 'mute' | null;
  focusNonce?: number;
  onFocusAction?: (button: 'fullscreen' | 'mute') => void;
  onBlurAction?: () => void;
}

export const HeroActions: React.FC<HeroActionsProps> = React.memo(({
  hasActivePlayer = true,
  isMuted = false,
  onToggleMute,
  onOpenFullScreen,
  customActions,
  focusTargetButton,
  focusNonce = 0,
  onFocusAction,
  onBlurAction,
}) => {
  if (customActions) {
    return <View style={styles.container}>{customActions}</View>;
  }

  if (!hasActivePlayer) {
    return null;
  }

  const isFsFocusable = Boolean(focusTargetButton && focusTargetButton === 'fullscreen');
  const isMuteFocusable = Boolean(focusTargetButton && focusTargetButton === 'mute');

  return (
    <View style={styles.container}>
      {onOpenFullScreen && (
        <HeroActionButton
          iconName="fullscreen"
          onPress={onOpenFullScreen}
          label="מסך מלא"
          focusable={isFsFocusable}
          hasTVPreferredFocus={focusTargetButton === 'fullscreen'}
          focusNonce={focusTargetButton === 'fullscreen' ? focusNonce : 0}
          lockUp={true}
          lockDown={true}
          lockLeft={true}
          lockRight={false}
          onFocus={() => onFocusAction?.('fullscreen')}
        />
      )}
      {onToggleMute && (
        <HeroActionButton
          iconName={isMuted ? 'volume-off' : 'volume-up'}
          onPress={onToggleMute}
          label={isMuted ? 'הפעל קול' : 'השתק'}
          focusable={isMuteFocusable}
          hasTVPreferredFocus={focusTargetButton === 'mute'}
          focusNonce={focusTargetButton === 'mute' ? focusNonce : 0}
          lockUp={true}
          lockDown={true}
          lockLeft={false}
          lockRight={true}
          onFocus={() => onFocusAction?.('mute')}
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
