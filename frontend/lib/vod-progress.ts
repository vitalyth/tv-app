"use client";

import { type Channel } from "@/lib/channels-data";

const VOD_PROGRESS_KEY = "vod_progress";
const VOD_PROGRESS_END_THRESHOLD_SECONDS = 30;

export interface VodProgress {
  currentTime: number;
  duration: number;
  updatedAt: number;
}

type VodProgressMap = Record<string, VodProgress>;

const isBrowser = () => typeof window !== "undefined";

const loadProgressMap = (): VodProgressMap => {
  if (!isBrowser()) return {};

  try {
    const raw = localStorage.getItem(VOD_PROGRESS_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveProgressMap = (map: VodProgressMap) => {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(VOD_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
};

export const getVodProgressKey = (channel: Pick<Channel, "id" | "module" | "vodProgramId" | "vodSeasonId">) => {
  return [
    channel.module || "vod",
    channel.vodProgramId || "",
    channel.vodSeasonId || "",
    channel.id,
  ]
    .filter(Boolean)
    .join(":");
};

export const saveVodProgress = (
  channelId: string,
  currentTime: number,
  duration: number
) => {
  if (!channelId || !Number.isFinite(currentTime)) return;

  const map = loadProgressMap();

  if (
    Number.isFinite(duration) &&
    duration > 0 &&
    duration - currentTime <= VOD_PROGRESS_END_THRESHOLD_SECONDS
  ) {
    delete map[channelId];
    saveProgressMap(map);
    return;
  }

  map[channelId] = {
    currentTime,
    duration: Number.isFinite(duration) ? duration : 0,
    updatedAt: Date.now(),
  };

  saveProgressMap(map);
};

export const getVodProgress = (
  channelId: string
): VodProgress | null => {
  if (!channelId) return null;

  const map = loadProgressMap();
  return map[channelId] ?? null;
};

export const clearVodProgress = (channelId: string) => {
  if (!channelId) return;

  const map = loadProgressMap();
  delete map[channelId];
  saveProgressMap(map);
};

export const shouldResumeVodProgress = (
  currentTime: number,
  duration: number
): boolean => {
  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    return false;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return true;
  }

  return duration - currentTime > VOD_PROGRESS_END_THRESHOLD_SECONDS;
};

export const getVodProgressPercent = (
  channelId: string
): number => {
  const progress = getVodProgress(channelId);

  if (!progress) return 0;

  if (
    !Number.isFinite(progress.duration) ||
    progress.duration <= 0 ||
    !Number.isFinite(progress.currentTime) ||
    progress.currentTime <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (progress.currentTime / progress.duration) * 100)
  );
};
