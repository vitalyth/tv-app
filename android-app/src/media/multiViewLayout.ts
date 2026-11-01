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
  const inset = 8;
  const gap = 2;
  const cellWidth = (width - 2 * inset + gap) / 2;
  const cellHeight = (height - 2 * inset + gap) / rows;
  return {
    position: 'absolute',
    left: inset + (index % 2) * cellWidth,
    top: inset + Math.floor(index / 2) * cellHeight,
    width: cellWidth - gap,
    height: cellHeight - gap,
  };
}
