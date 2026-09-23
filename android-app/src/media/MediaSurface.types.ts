import type { MediaStreamType } from './player';

export interface MediaSurfaceProps {
  streamUrl: string;
  streamType?: MediaStreamType;
  fallbackStreamUrl?: string;
  fallbackStreamType?: MediaStreamType;
  onFirstFrame: () => void;
  onError: () => void;
}
