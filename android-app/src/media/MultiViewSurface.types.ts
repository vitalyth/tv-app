import type { MediaStream } from './player';

export interface MultiViewSurfaceProps {
  streams: MediaStream[];
  audioTile: number;
  paused: boolean;
  onTileState: (index: number, state: 'loading' | 'playing' | 'error') => void;
}
