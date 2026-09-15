import React from 'react';
import { StyleSheet } from 'react-native';
import { TvFocusable } from '../common/TvFocusable';
import { TvIcon, TvIconType } from '../common/TvIcon';

interface HeroActionButtonProps {
  iconName: TvIconType;
  onPress: () => void;
  label?: string;
  testID?: string;
}

export const HeroActionButton: React.FC<HeroActionButtonProps> = React.memo(({
  iconName,
  onPress,
  label,
  testID,
}) => {
  return (
    <TvFocusable
      onPress={onPress}
      testID={testID}
      scaleOnFocus={false}
      style={styles.button}
      focusedStyle={styles.buttonFocused}
    >
      {({ focused }) => (
        <TvIcon
          name={iconName}
          size={20}
          color={focused ? '#091016' : '#FFFFFF'}
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
    borderColor: 'rgba(255, 255, 255, 0.25)',
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
