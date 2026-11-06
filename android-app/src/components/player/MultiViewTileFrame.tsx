import {useEffect, useRef, type PropsWithChildren} from 'react';
import {Animated, Easing, StyleSheet, type ViewProps} from 'react-native';
import {multiViewFocusLayout, multiViewTileLayout, MULTIVIEW_FOCUS_ANIMATION_MS} from '../../media/multiViewLayout';
import {tvPlatform} from '../../platform/runtime';

interface Props extends PropsWithChildren<ViewProps> {
  index: number;
  count: number;
  activeTile: number;
  width: number;
  height: number;
  active?: boolean;
  fullCanvas?: boolean;
  animateFocus?: boolean;
}

/** Keep the decoder's surface size stable; only native transforms follow focus. */
export function MultiViewTileFrame({index, count, activeTile, width, height,
  active = true, fullCanvas = false, animateFocus = true, style, children, ...props}: Props) {
  const supported = tvPlatform.id === 'android-tv' && animateFocus;
  const box = active ? multiViewFocusLayout(index, count, width, height, activeTile)
    : {left: 0, top: 0, width, height};
  const initialFullCanvas = useRef(fullCanvas).current;
  const baseWidth = initialFullCanvas ? width : width / 2;
  const baseHeight = initialFullCanvas ? height : height / 2;
  const x = box.left + (box.width - baseWidth) / 2;
  const y = box.top + (box.height - baseHeight) / 2;
  const scale = baseWidth > 0 ? box.width / baseWidth : 1;
  const translationX = useRef(new Animated.Value(x)).current;
  const translationY = useRef(new Animated.Value(y)).current;
  const zoom = useRef(new Animated.Value(scale)).current;
  useEffect(() => {
    if (!supported) return;
    const animation = Animated.parallel([
      [translationX, x], [translationY, y], [zoom, scale],
    ].map(([value, toValue]) => Animated.timing(value as Animated.Value, {
      toValue: toValue as number, duration: MULTIVIEW_FOCUS_ANIMATION_MS,
      easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    })));
    animation.start();
    return () => animation.stop();
  }, [supported, translationX, translationY, zoom, x, y, scale]);

  return (
    <Animated.View {...props} style={[
      style,
      supported ? {position: 'absolute', left: 0, top: 0, width: baseWidth, height: baseHeight,
        zIndex: active && index === activeTile ? 2 : 1,
        transform: [{translateX: translationX}, {translateY: translationY}, {scale: zoom}]} :
        active ? multiViewTileLayout(index, count, width, height) : StyleSheet.absoluteFill,
    ]}>
      {children}
    </Animated.View>
  );
}
