import React, { memo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { TvChannel, TvProgram } from '../../types/guide';
import { isProgramCurrent, HALF_HOUR_SECONDS, SLOT_WIDTH } from '../../utils/epgUtils';
import EpgProgramCard from './EpgProgramCard';

interface EpgRowProps {
  channel: TvChannel;
  programs: TvProgram[];
  timelineStartSeconds: number;
  timelineEndSeconds?: number;
  scrollOffsetPx?: number;
  viewportWidth?: number;
  rowHeight: number;
  isActiveRow: boolean;
  focusedProgramIndex: number;
  isPlayingChannel: boolean;
  nowSeconds: number;
  onProgramPress: (channel: TvChannel, program: TvProgram) => void;
}

const EpgRowComponent: React.FC<EpgRowProps> = ({
  channel,
  programs,
  timelineStartSeconds,
  timelineEndSeconds,
  scrollOffsetPx,
  viewportWidth,
  rowHeight,
  isActiveRow,
  focusedProgramIndex,
  isPlayingChannel,
  nowSeconds,
  onProgramPress,
}) => {
  const handleCardPress = useCallback(
    (p: TvProgram) => {
      onProgramPress(channel, p);
    },
    [channel, onProgramPress]
  );

  if (!programs || programs.length === 0) {
    return <View style={[styles.row, { height: rowHeight }]} />;
  }

  // Horizontal Windowing: only render programs in [minVisiblePx, maxVisiblePx] or focused
  const shouldWindow =
    scrollOffsetPx !== undefined &&
    viewportWidth !== undefined &&
    timelineEndSeconds !== undefined;

  let firstVisibleIdx = 0;
  let lastVisibleIdx = programs.length - 1;
  let leftSpacerWidth = 0;
  let rightSpacerWidth = 0;

  if (shouldWindow) {
    const HORIZONTAL_BUFFER_PX = 360;
    const minVisiblePx = Math.max(0, scrollOffsetPx - HORIZONTAL_BUFFER_PX);
    const maxVisiblePx = scrollOffsetPx + viewportWidth + HORIZONTAL_BUFFER_PX;

    let foundFirst = -1;
    let foundLast = -1;

    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      const startPx = ((p.startSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH;
      const endPx = ((p.endSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH;
      const isIntersects = endPx >= minVisiblePx && startPx <= maxVisiblePx;
      const isFocused = isActiveRow && i === focusedProgramIndex;

      if (isIntersects || isFocused) {
        if (foundFirst === -1) foundFirst = i;
        foundLast = i;
      }
    }

    if (foundFirst !== -1) {
      firstVisibleIdx = foundFirst;
      lastVisibleIdx = foundLast;
    }

    if (firstVisibleIdx > 0) {
      leftSpacerWidth = Math.max(
        0,
        ((programs[firstVisibleIdx].startSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH
      );
    }

    if (lastVisibleIdx < programs.length - 1) {
      rightSpacerWidth = Math.max(
        0,
        ((timelineEndSeconds - programs[lastVisibleIdx].endSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH
      );
    }
  }

  const visiblePrograms = programs.slice(firstVisibleIdx, lastVisibleIdx + 1);

  return (
    <View style={[styles.row, { height: rowHeight }]}>
      {leftSpacerWidth > 0 && <View style={{ width: leftSpacerWidth, height: rowHeight }} />}
      {visiblePrograms.map((program, offsetIdx) => {
        const idx = firstVisibleIdx + offsetIdx;
        const durationSec = Math.max(0, program.endSeconds - program.startSeconds);
        const cardWidth = (durationSec / HALF_HOUR_SECONDS) * SLOT_WIDTH;
        const isFocused = isActiveRow && idx === focusedProgramIndex;
        const isLive = isProgramCurrent(program, nowSeconds);
        const isPlaying = isPlayingChannel && isLive;

        // Visible slice of this card within the horizontal viewport
        const currentScrollPx = scrollOffsetPx ?? 0;
        const currentViewportWidth = viewportWidth ?? 800;
        const cardStartPx = ((program.startSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * SLOT_WIDTH;
        const visibleStartPx = Math.max(0, currentScrollPx - cardStartPx);
        const visibleEndPx = Math.min(cardWidth, currentScrollPx + currentViewportWidth - cardStartPx);
        const visibleWidthPx = Math.max(0, visibleEndPx - visibleStartPx);

        return (
          <EpgProgramCard
            key={program.id || `${channel.id}_${idx}`}
            program={program}
            width={cardWidth}
            height={rowHeight}
            isFocused={isFocused}
            isActiveRow={isActiveRow}
            isLive={isLive}
            isPlaying={isPlaying}
            visibleStartPx={visibleStartPx}
            visibleEndPx={visibleEndPx}
            visibleWidthPx={visibleWidthPx}
            onPress={handleCardPress}
          />
        );
      })}
      {rightSpacerWidth > 0 && <View style={{ width: rightSpacerWidth, height: rowHeight }} />}
    </View>
  );
};

function areRowPropsEqual(prev: EpgRowProps, next: EpgRowProps): boolean {
  return (
    prev.channel.id === next.channel.id &&
    prev.isActiveRow === next.isActiveRow &&
    prev.focusedProgramIndex === next.focusedProgramIndex &&
    prev.rowHeight === next.rowHeight &&
    prev.isPlayingChannel === next.isPlayingChannel &&
    prev.scrollOffsetPx === next.scrollOffsetPx &&
    prev.viewportWidth === next.viewportWidth &&
    prev.timelineStartSeconds === next.timelineStartSeconds &&
    prev.timelineEndSeconds === next.timelineEndSeconds &&
    prev.nowSeconds === next.nowSeconds &&
    prev.programs === next.programs
  );
}

export const EpgRow = memo(EpgRowComponent, areRowPropsEqual);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
});

export default EpgRow;
