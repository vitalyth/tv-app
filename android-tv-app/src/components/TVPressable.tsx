import React, { useState, forwardRef } from 'react';
import { Pressable, ViewStyle, StyleSheet } from 'react-native';
import { Colors } from '../utils/theme';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  focusStyle?: ViewStyle;
  hasTVPreferredFocus?: boolean;
}

const TVPressable = forwardRef<any, Props>(
  ({ children, onPress, style, focusStyle, hasTVPreferredFocus }, ref) => {
    const [focused, setFocused] = useState(false);

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={hasTVPreferredFocus}
        style={[
          style,
          focused && styles.focusBase,
          focused && focusStyle,
        ]}
      >
        {children}
      </Pressable>
    );
  }
);

TVPressable.displayName = 'TVPressable';
export default TVPressable;

const styles = StyleSheet.create({
  focusBase: {
    transform: [{ scale: 1.07 }],
    borderColor: Colors.borderFocus,
    // Android TV elevation glow
    elevation: 14,
    zIndex: 20,
  },
});
