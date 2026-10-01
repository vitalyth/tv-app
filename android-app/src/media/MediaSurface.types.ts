import type { StyleProp, ViewStyle } from 'react-native';
import type { MediaStreamType, VideoQualityOption } from './player';

export interface MediaSurfaceProps {
  streamUrl: string;
  streamType?: MediaStreamType;
  fallbackStreamUrl?: string;
  fallbackStreamType?: MediaStreamType;
  isMuted?: boolean;
  paused?: boolean;
  startPositionSeconds?: number;
  selectedQualityId?: string;
  style?: StyleProp<ViewStyle>;
  onFirstFrame: () => void;
  onError: () => void;
  onProgress?: (data: {
    currentTime: number;
    playableDuration: number;
    seekableDuration: number;
  }) => void;
  onVideoTracks?: (tracks: VideoQualityOption[]) => void;
}
