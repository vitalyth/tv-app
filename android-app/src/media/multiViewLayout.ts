import type { ViewStyle } from 'react-native';
import { tvPlatform } from '../platform/runtime';
import { softwareMultiViewAvailable } from './nativeMultiView';
import type { MultiViewState } from './player';

export const MULTIVIEW_MAX_STREAMS = tvPlatform.id === 'kepler' ? 2 : 4;

export function multiViewMaxStreams(backend?: MultiViewState['backend']) {
  return backend === 'software' && softwareMultiViewAvailable
    ? 4
    : MULTIVIEW_MAX_STREAMS;
}

export function multiViewTileLayout(
  index: number,
  count: number,
  width: number,
  height: number,
): ViewStyle {
  if (count === 1) {
    return { position: 'absolute', left: 0, top: 0, width, height };
  }
  const rows = count > 2 ? 2 : 1;
  const cellWidth = (width - 24) / 2;
  const cellHeight = (height - 24) / rows;
  return {
    position: 'absolute',
    left: 18 + (index % 2) * cellWidth,
    top: 18 + Math.floor(index / 2) * cellHeight,
    width: cellWidth - 12,
    height: cellHeight - 12,
  };
}
