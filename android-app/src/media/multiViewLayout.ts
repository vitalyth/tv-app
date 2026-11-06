import type { ViewStyle } from 'react-native';
import { tvPlatform } from '../platform/runtime';
import { softwareMultiViewAvailable } from './nativeMultiView';
import { MULTIVIEW_MAX_BITRATE, type MultiViewState } from './player';

// Reserve the dense-grid decoder budget from entry. Adding/removing tiles must
// not change the codec mode of streams which are already playing.
export function multiViewBitrateLimit(_count: number): number {
  return MULTIVIEW_MAX_BITRATE;
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

export const MULTIVIEW_FOCUS_ANIMATION_MS = 200;
export const MULTIVIEW_FOCUS_WIDTH_FRACTION = 0.72;
export const MULTIVIEW_TOOLBAR_HEIGHT = 56;
export const MULTIVIEW_TOOLBAR_GAP = 12;

/** A dominant focused video, on the left, with the remaining videos stacked on the right. */
export function multiViewFocusLayout(index: number, count: number, width: number, height: number, focusedTile: number) {
  if (width <= 0 || height <= 0) return {left: 0, top: 0, width: Math.max(0, width), height: Math.max(0, height)};
  const toolbarSpace = MULTIVIEW_TOOLBAR_HEIGHT + MULTIVIEW_TOOLBAR_GAP;
  if (count <= 1) {
    const videoHeight = Math.max(0, height - 16 - toolbarSpace);
    const videoWidth = Math.min(Math.max(0, width - 16), videoHeight * width / height);
    return {left: (width - videoWidth) / 2, top: 8, width: videoWidth, height: videoWidth * height / width};
  }
  const focused = Math.max(0, Math.min(count - 1, focusedTile));
  const aspect = width / height;
  const gap = 20;
  const availableWidth = Math.max(0, width - 16);
  const availableHeight = Math.max(0, height - 16);
  const others = count - 1;
  const verticalGap = 24;
  const largeWidth = Math.min(Math.max(0, availableWidth - gap) * MULTIVIEW_FOCUS_WIDTH_FRACTION, Math.max(0, availableHeight - toolbarSpace) * aspect);
  const smallWidth = Math.max(0, Math.min(availableWidth - gap - largeWidth,
    ((availableHeight - (others - 1) * verticalGap) / others) * aspect));
  const smallHeight = smallWidth / aspect;
  const largeHeight = largeWidth / aspect;
  const groupLeft = (width - largeWidth - gap - smallWidth) / 2;
  if (index === focused) {
    return {left: groupLeft,
      top: Math.max(8, (height - largeHeight - toolbarSpace) / 2), width: largeWidth, height: largeHeight};
  }
  const rank = index < focused ? index : index - 1;
  const columnHeight = others * smallHeight + (others - 1) * verticalGap;
  return {left: groupLeft + largeWidth + gap,
    top: (height - columnHeight) / 2 + rank * (smallHeight + verticalGap), width: smallWidth, height: smallHeight};
}

/** Screen-space toolbar, outside the transformed and clipped video frames. */
export function multiViewToolbarLayout(count: number, width: number, height: number, activeTile: number) {
  const video = multiViewFocusLayout(activeTile, count, width, height, activeTile);
  return {position: 'absolute' as const, left: video.left,
    top: video.top + video.height + MULTIVIEW_TOOLBAR_GAP,
    width: video.width, height: MULTIVIEW_TOOLBAR_HEIGHT};
}
