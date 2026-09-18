import { TvChannel, TvProgram } from '../types/guide';

export const GRID_LOOKBACK_SECONDS = 3600; // 1 hour lookback
export const GRID_VISIBLE_WINDOW_SECONDS = 43200; // 12 hours visible
export const HALF_HOUR_SECONDS = 1800; // 30 minutes
export const SLOT_WIDTH = 180; // pixels per 30-minute interval
export const CHANNEL_WIDTH = 148; // sticky channel column width
export const HEADER_HEIGHT = 36; // timeline header height
export const ACTIVE_ROW_HEIGHT = 96; // active/focused row height (matching Kotlin Compose 288 * 0.34)
export const INACTIVE_ROW_HEIGHT = 48; // inactive row height (matching Kotlin Compose (288 - 96) / 4)
export const ROW_GAP = 6;
export const GRID_MOTION_MS = 120;
export const GRID_NAV_THROTTLE_MS = 70;
export const VISIBLE_ROW_COUNT = 5;

export function preferredFirstVisibleRow(
  selectedIndex: number,
  totalChannels: number,
  visibleRowCount = VISIBLE_ROW_COUNT
): number {
  const maxFirstVisible = Math.max(0, totalChannels - visibleRowCount);
  return Math.max(0, Math.min(selectedIndex - 1, maxFirstVisible));
}

export function floorToHalfHour(sec: number): number {
  return sec - (((sec % HALF_HOUR_SECONDS) + HALF_HOUR_SECONDS) % HALF_HOUR_SECONDS);
}

export function roundUpToHour(sec: number): number {
  const remainder = ((sec % 3600) + 3600) % 3600;
  return remainder === 0 ? sec + 3600 : sec + (3600 - remainder);
}

export function formatClock(sec: number): string {
  if (!sec || isNaN(sec)) return '--:--';
  const d = new Date(sec * 1000);
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

export function formatTimeRange(startSec?: number, endSec?: number): string {
  if (!startSec || !endSec) return '';
  return `${formatClock(startSec)} - ${formatClock(endSec)}`;
}

export function isProgramCurrent(program: TvProgram, nowSec: number): boolean {
  return nowSec >= program.startSeconds && nowSec < program.endSeconds;
}

/**
 * Fills timeline gaps with placeholder blocks so that the row is continuous and uninterrupted,
 * exactly as done in the native Android app's `displayProgramsForChannel`.
 */
export function displayProgramsForChannel(
  channel: TvChannel,
  programs: TvProgram[],
  timelineStartSeconds: number,
  timelineEndSeconds: number
): TvProgram[] {
  if (!programs || programs.length === 0) {
    return noProgramBlocks(channel.id, timelineStartSeconds, timelineEndSeconds);
  }

  const sorted = [...programs]
    .filter((p) => p.endSeconds > timelineStartSeconds && p.startSeconds < timelineEndSeconds)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (sorted.length === 0) {
    return noProgramBlocks(channel.id, timelineStartSeconds, timelineEndSeconds);
  }

  const filledPrograms: TvProgram[] = [];
  let cursorSeconds = timelineStartSeconds;

  for (const program of sorted) {
    const coveredStart = Math.max(program.startSeconds, timelineStartSeconds);
    const coveredEnd = Math.min(program.endSeconds, timelineEndSeconds);
    if (coveredEnd <= coveredStart) continue;

    if (coveredStart > cursorSeconds) {
      filledPrograms.push(...noProgramBlocks(channel.id, cursorSeconds, coveredStart));
    }

    filledPrograms.push({
      ...program,
      startSeconds: coveredStart,
      endSeconds: coveredEnd,
      timeRange: program.timeRange || formatTimeRange(program.startSeconds, program.endSeconds),
    });

    cursorSeconds = Math.max(cursorSeconds, coveredEnd);
  }

  if (cursorSeconds < timelineEndSeconds) {
    filledPrograms.push(...noProgramBlocks(channel.id, cursorSeconds, timelineEndSeconds));
  }

  return filledPrograms.sort((a, b) => a.startSeconds - b.startSeconds);
}

function noProgramBlocks(channelId: string, startSec: number, endSec: number): TvProgram[] {
  if (endSec <= startSec) return [];
  const blocks: TvProgram[] = [];
  let currentStart = startSec;

  while (currentStart < endSec) {
    const nextHour = roundUpToHour(currentStart);
    const blockEnd = Math.min(nextHour, endSec);
    blocks.push({
      id: `${channelId}_gap_${currentStart}`,
      channelId,
      startSeconds: currentStart,
      endSeconds: blockEnd,
      title: 'אין מידע',
      description: '',
      imageUrl: undefined,
      timeRange: formatTimeRange(currentStart, blockEnd),
    });
    currentStart = blockEnd;
  }

  return blocks;
}

export function programIndexAtTime(programs: TvProgram[], targetSeconds: number): number {
  if (!programs || programs.length === 0) return -1;

  const matchIdx = programs.findIndex(
    (p) => targetSeconds >= p.startSeconds && targetSeconds < p.endSeconds
  );
  if (matchIdx !== -1) return matchIdx;

  // Closest program by center time
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < programs.length; i++) {
    const center = (programs[i].startSeconds + programs[i].endSeconds) / 2;
    const diff = Math.abs(center - targetSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

export function liveProgramIndex(programs: TvProgram[], nowSeconds: number): number {
  if (!programs || programs.length === 0) return -1;
  const liveIdx = programs.findIndex((p) => isProgramCurrent(p, nowSeconds));
  if (liveIdx !== -1) return liveIdx;
  return programIndexAtTime(programs, nowSeconds);
}

export function scrollOffsetKeepingProgramVisible(
  program: TvProgram,
  timelineStartSeconds: number,
  slotWidth: number,
  viewportWidth: number,
  currentScrollOffset: number,
  maxScrollOffset: number
): number {
  const programStartPx = ((program.startSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * slotWidth;
  const programEndPx = ((program.endSeconds - timelineStartSeconds) / HALF_HOUR_SECONDS) * slotWidth;
  const visibleStartPx = currentScrollOffset;
  const visibleEndPx = visibleStartPx + viewportWidth;
  const edgePaddingPx = slotWidth * 0.15;

  if (programStartPx >= visibleStartPx + edgePaddingPx && programEndPx <= visibleEndPx - edgePaddingPx) {
    return currentScrollOffset;
  }
  if (programStartPx < visibleStartPx + edgePaddingPx) {
    return Math.max(0, Math.min(programStartPx - edgePaddingPx, maxScrollOffset));
  }
  return Math.max(0, Math.min(programEndPx - viewportWidth + edgePaddingPx, maxScrollOffset));
}
