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
  lockUp?: boolean;
  lockDown?: boolean;
  lockLeft?: boolean;
  lockRight?: boolean;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  scaleOnFocus?: boolean;
  activeScale?: number;
  focusable?: boolean;
  testID?: string;
}

export const TvFocusable: React.FC<TvFocusableProps> = React.memo(({
  children,
  onPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus = false,
  focusNonce = 0,
  lockUp,
  lockDown,
  lockLeft,
  lockRight,
  style,
  focusedStyle,
  scaleOnFocus = false,
  activeScale = 1.0,
  focusable = true,
  testID,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const pressableRef = useRef<any>(null);
  const prevNonceRef = useRef<number>(0);
  const mountedRef = useRef(false);

  const handleFocus = React.useCallback(() => {
    if (!focusable) return;
    setIsFocused(true);
    onFocus?.();
  }, [focusable, onFocus]);

  const handleBlur = React.useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  // Reset internal focus state if focusable becomes false
  useEffect(() => {
    if (!focusable && isFocused) {
      setIsFocused(false);
      onBlur?.();
    }
  }, [focusable, isFocused, onBlur]);

  // Sync focus boundaries with native Android view
  useEffect(() => {
    if (lockUp !== undefined || lockDown !== undefined || lockLeft !== undefined || lockRight !== undefined) {
      const applyBoundaries = () => {
        try {
          const handle = findNodeHandle(pressableRef.current);
          if (handle) {
            vodProgressService.setFocusBoundaries(handle, {
              lockUp,
              lockDown,
              lockLeft,
              lockRight,
            });
          }
        } catch {}
      };

      applyBoundaries();
      const timer = setTimeout(applyBoundaries, 50);
      return () => clearTimeout(timer);
    }
  }, [lockUp, lockDown, lockLeft, lockRight]);

  // Controlled programmatic focus (initial mount or fresh focusNonce only)
  useEffect(() => {
    if (!focusable) return;

    if (!mountedRef.current) {
      mountedRef.current = true;
      if (hasTVPreferredFocus) {
        const doFocus = () => {
          try {
            const handle = findNodeHandle(pressableRef.current);
            if (handle) vodProgressService.requestViewFocus(handle);
          } catch {}
        };
        doFocus();
        const t1 = setTimeout(doFocus, 40);
        const t2 = setTimeout(doFocus, 120);
        const t3 = setTimeout(doFocus, 250);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
    }

    if (focusNonce > 0 && focusNonce !== prevNonceRef.current) {
      prevNonceRef.current = focusNonce;
      const requestFocus = () => {
        try {
          const handle = findNodeHandle(pressableRef.current);
          if (handle) {
            vodProgressService.requestViewFocus(handle);
          }
        } catch {}
      };

      requestFocus();
      const timer = setTimeout(requestFocus, 40);
      return () => clearTimeout(timer);
    }
  }, [hasTVPreferredFocus, focusNonce, focusable]);

  return (
    <Pressable
      ref={pressableRef}
      focusable={focusable}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={focusable ? hasTVPreferredFocus : false}
      testID={testID}
      style={(state: any) => {
        const focused = Boolean(focusable && (isFocused || !!state.focused));
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
        const focused = Boolean(focusable && (isFocused || !!state.focused));
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


