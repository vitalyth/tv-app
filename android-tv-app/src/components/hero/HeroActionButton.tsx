import React from 'react';
import { StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvIcon, TvIconType } from '../common/TvIcon';

interface HeroActionButtonProps {
  iconName: TvIconType;
  onPress: () => void;
  label?: string;
  testID?: string;
  hasTVPreferredFocus?: boolean;
  focusNonce?: number;
  focusable?: boolean;
  lockUp?: boolean;
  lockDown?: boolean;
  lockLeft?: boolean;
  lockRight?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const HeroActionButton: React.FC<HeroActionButtonProps> = React.memo(({
  iconName,
  onPress,
  label,
  testID,
  hasTVPreferredFocus = false,
  focusNonce = 0,
  focusable = true,
  lockUp,
  lockDown,
  lockLeft,
  lockRight,
  onFocus,
  onBlur,
}) => {
  return (
    <TvFocusable
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      focusable={focusable}
      hasTVPreferredFocus={hasTVPreferredFocus && focusable}
      focusNonce={focusable ? focusNonce : 0}
      lockUp={lockUp}
      lockDown={lockDown}
      lockLeft={lockLeft}
      lockRight={lockRight}
      testID={testID}
      scaleOnFocus={false}
      style={styles.button}
      focusedStyle={focusable ? styles.buttonFocused : undefined}
    >
      {({ focused }) => (
        <TvIcon
          name={iconName}
          size={20}
          color={(focusable && focused) ? '#091016' : '#FFFFFF'}
        />
      )}
    </TvFocusable>
  );
});

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(14, 20, 29, 0.55)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFocused: {
    backgroundColor: '#F2F4F7',
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
});

export default HeroActionButton;
