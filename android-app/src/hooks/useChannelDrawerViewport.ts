import {useEffect, useRef} from 'react';
import {Animated, Easing, useWindowDimensions} from 'react-native';
import {channelDrawerLayout, CHANNEL_DRAWER_ANIMATION_MS} from '../media/playerLayout';

/** Apply the same native animation to a player or the complete Multi View grid. */
export function useChannelDrawerViewport(open: boolean) {
  const {width, height} = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const frame = channelDrawerLayout(width, height);
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: CHANNEL_DRAWER_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [open, progress]);
  return {
    transform: [
      {translateX: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, frame.videoLeft - (width - frame.videoWidth) / 2],
      })},
      {scale: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, width > 0 ? frame.videoWidth / width : 1],
      })},
    ],
  };
}
