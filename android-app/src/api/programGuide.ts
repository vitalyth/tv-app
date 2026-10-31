import { liveEpgStore } from '../state/liveEpg';
import { getJson } from './client';
import {
  getPlayableLiveChannels,
  refreshMediaItemEpg,
  currentTimeMs,
  formatProgramTimeRange,
  resolveBackdropUrl,
  resolvePosterUrl,
} from './channels';
import type { MediaItem } from '../media/player';

export const GUIDE_SLOT_MS = 30 * 60 * 1000;
export const GUIDE_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface GuideProgram {
  id: string;
  title: string;
  start: number;
  end: number;
  description?: string;
  image?: string;
  poster?: string;
  backdrop?: string;
  backdrop_image?: string;
  placeholder?: boolean;
}
export interface GuideData {
  channels: MediaItem[];
  programs: Record<string, GuideProgram[]>;
  start: number;
  end: number;
}

export function guideStart(now: number): number {
  return Math.floor(now / GUIDE_SLOT_MS) * GUIDE_SLOT_MS - 3600000;
}

function time(value: unknown): number {
  const numeric = Number(value);
  return numeric < 10000000000 ? numeric * 1000 : numeric;
}

export function normalizePrograms(raw: unknown): GuideProgram[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .flatMap((entry): GuideProgram[] => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const start = time(entry.start);
      const end = time(entry.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return [];
      }
      return [
        {
          id: `${start}-${end}`,
          title: String(entry.name || entry.title || ''),
          start,
          end,
          description:
            typeof entry.description === 'string'
              ? entry.description
              : undefined,
          image: typeof entry.image === 'string' ? entry.image : undefined,
          poster: typeof entry.poster === 'string' ? entry.poster : undefined,
          backdrop:
            typeof entry.backdrop === 'string' ? entry.backdrop : undefined,
          backdrop_image:
            typeof entry.backdrop_image === 'string'
              ? entry.backdrop_image
              : undefined,
        },
      ];
    })
    .sort((a, b) => a.start - b.start);
}

export function fillGuideGaps(
  programs: GuideProgram[],
  start: number,
  end: number,
): GuideProgram[] {
  const result: GuideProgram[] = [];
  let cursor = start;
  const fillUntil = (until: number) => {
    while (cursor < until) {
      const next = Math.min(
        until,
        (Math.floor(cursor / GUIDE_SLOT_MS) + 1) * GUIDE_SLOT_MS,
      );
      result.push({
        id: `gap-${cursor}`,
        title: '',
        start: cursor,
        end: next,
        placeholder: true,
      });
      cursor = next;
    }
  };
  for (const program of programs) {
    if (program.end <= cursor || program.start >= end) {
      continue;
    }
    fillUntil(Math.min(end, program.start));
    result.push({
      ...program,
      start: Math.max(cursor, program.start),
      end: Math.min(end, program.end),
    });
    cursor = Math.min(end, program.end);
  }
  fillUntil(end);
  return result;
}

export function programAt(programs: GuideProgram[], anchor: number): number {
  const index = programs.findIndex(p => p.start <= anchor && anchor < p.end);
  return index >= 0 ? index : Math.max(0, programs.length - 1);
}

export function guideMediaItem(
  channel: MediaItem,
  program: GuideProgram,
  now: number,
): MediaItem {
  const isLive = program.start <= now && now < program.end;
  const artwork = program;
  return {
    ...channel,
    id: isLive ? channel.id : `guide:${channel.id}:${program.id}`,
    title: program.title || channel.channelName || channel.title,
    description: program.description,
    imageUrl: resolvePosterUrl(artwork) || channel.fallbackImageUrl,
    backdropUrl: resolveBackdropUrl(artwork) || channel.fallbackImageUrl,
    timeRange: formatProgramTimeRange(program.start, program.end),
    isLive,
  };
}

let guideRequest: Promise<GuideData> | undefined;
let guideCache: { data: GuideData; time: number } | undefined;
export async function getProgramGuide(
  now = currentTimeMs(),
): Promise<GuideData> {
  if (liveEpgStore.active && guideCache && Date.now() - guideCache.time < 15000)
    return guideCache.data;
  if (guideRequest) return guideRequest;
  guideRequest = loadProgramGuide(now)
    .then(data => {
      guideCache = { data, time: Date.now() };
      return data;
    })
    .finally(() => {
      guideRequest = undefined;
    });
  return guideRequest;
}

async function loadProgramGuide(now: number): Promise<GuideData> {
  const start = guideStart(now);
  const end = start + GUIDE_WINDOW_MS;
  const channels = await getPlayableLiveChannels();
  let epg: Record<string, unknown> = {};
  try {
    const response = await getJson<unknown>(
      `/epg?start=${start / 1000}&end=${end / 1000}`,
    );
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      epg = response as Record<string, unknown>;
    }
  } catch {
    // Inline channel schedules remain usable when the EPG endpoint is unavailable.
  }
  const programs: Record<string, GuideProgram[]> = {};
  for (const channel of channels) {
    const payload = channel.sourcePayload as
      | { programs?: unknown; channelID?: string; tvgID?: string }
      | undefined;
    const schedule = normalizePrograms(
      epg[payload?.tvgID ?? ''] ??
        epg[channel.id] ??
        epg[payload?.channelID ?? ''] ??
        epg[channel.channelNumber ?? ''] ??
        epg[channel.channelName ?? ''],
    );
    programs[channel.id] = schedule.length
      ? schedule
      : normalizePrograms(payload?.programs);
  }
  const enriched = channels.map(channel => {
    const payload = channel.sourcePayload as
      | Record<string, unknown>
      | undefined;
    const schedule = programs[channel.id];
    return refreshMediaItemEpg({
      ...channel,
      sourcePayload: {
        ...payload,
        programs: schedule.map(program => ({
          ...program,
          name: program.title,
        })),
      },
    });
  });
  liveEpgStore.publish(enriched);
  return { channels: enriched, programs, start, end };
}
