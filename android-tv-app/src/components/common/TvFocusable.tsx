import React, { ReactNode, useRef, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  findNodeHandle,
} from 'react-native';
import { vodProgressService } from '../../services/vodProgress';

interface TvFocusableProps {
  children: ReactNode | ((state: { focused: boolean }) => ReactNode);
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  hasTVPreferredFocus?: boolean;
  focusNonce?: number;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  scaleOnFocus?: boolean;
  activeScale?: number;
  testID?: string;
}

export const TvFocusable: React.FC<TvFocusableProps> = React.memo(({
  children,
  onPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus = false,
  focusNonce = 0,
  style,
  focusedStyle,
  scaleOnFocus = false,
  activeScale = 1.0,
  testID,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const pressableRef = useRef<any>(null);

  const handleFocus = React.useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = React.useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  useEffect(() => {
    if (hasTVPreferredFocus) {
      const timer = setTimeout(() => {
        try {
          const handle = findNodeHandle(pressableRef.current);
          if (handle) {
            vodProgressService.requestViewFocus(handle);
          }
        } catch {}
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [hasTVPreferredFocus, focusNonce]);

  return (
    <Pressable
      ref={pressableRef}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      style={(state: any) => {
        const focused = isFocused || !!state.focused;
        return [
          styles.base,
          style,
          focused && styles.focused,
          focused && focusedStyle,
          focused && scaleOnFocus && { transform: [{ scale: activeScale }] },
        ];
      }}
    >
      {(state: any) => {
        const focused = isFocused || !!state.focused;
        return typeof children === 'function' ? children({ focused }) : children;
      }}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  focused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    zIndex: 10,
  },
});


