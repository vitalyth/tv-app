import type { StyleProp, ViewStyle } from 'react-native';
import type { MediaStreamType } from './player';

export interface MediaSurfaceProps {
  streamUrl: string;
  streamType?: MediaStreamType;
  fallbackStreamUrl?: string;
  fallbackStreamType?: MediaStreamType;
  isMuted?: boolean;
  style?: StyleProp<ViewStyle>;
  onFirstFrame: () => void;
  onError: () => void;
}
