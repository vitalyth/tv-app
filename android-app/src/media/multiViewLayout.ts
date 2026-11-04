import type { ViewStyle } from 'react-native';
import { tvPlatform } from '../platform/runtime';
import { softwareMultiViewAvailable } from './nativeMultiView';
import { MULTIVIEW_MAX_BITRATE, type MultiViewState } from './player';

// Three/four Android tiles use the dense-grid budget. On the affected Sony TV
// this also enables reserving hardware AVC decoders for HD-only streams.
export function multiViewBitrateLimit(count: number): number {
  return tvPlatform.id === 'android-tv' && count <= 2
    ? MULTIVIEW_MAX_BITRATE * 2 : MULTIVIEW_MAX_BITRATE;
}

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
