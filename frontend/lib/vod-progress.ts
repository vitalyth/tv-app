export const VOD_PROGRESS_STORAGE_KEY = "vod_playback_progress";

export type VodProgress = {
  currentTime: number;
  duration: number;
  updatedAt?: number;
};

export const getVodProgress = (itemId?: string): VodProgress | null => {
  if (!itemId || typeof window === "undefined") return null;

  try {
    const progress = JSON.parse(localStorage.getItem(VOD_PROGRESS_STORAGE_KEY) || "{}") as Record<
      string,
      Partial<VodProgress>
    >;
    const saved = progress[itemId];
    const currentTime = saved?.currentTime ?? 0;
    const duration = saved?.duration ?? 0;

    if (!Number.isFinite(currentTime) || currentTime <= 0) return null;

    return {
      currentTime,
      duration: Number.isFinite(duration) ? duration : 0,
      updatedAt: saved?.updatedAt,
    };
  } catch {
    return null;
  }
};

export const getVodProgressPercent = (itemId?: string): number => {
  const progress = getVodProgress(itemId);

  if (!progress || !Number.isFinite(progress.duration) || progress.duration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (progress.currentTime / progress.duration) * 100));
};

export const saveVodProgress = (itemId: string | undefined, currentTime: number, duration: number) => {
  if (!itemId || typeof window === "undefined") return;
  if (!Number.isFinite(currentTime) || currentTime < 10) return;

  try {
    const progress = JSON.parse(localStorage.getItem(VOD_PROGRESS_STORAGE_KEY) || "{}") as Record<
      string,
      VodProgress
    >;

    if (Number.isFinite(duration) && duration > 0 && duration - currentTime <= 30) {
      delete progress[itemId];
    } else {
      progress[itemId] = {
        currentTime,
        duration: Number.isFinite(duration) ? duration : 0,
        updatedAt: Date.now(),
      };
    }

    localStorage.setItem(VOD_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore localStorage write errors.
  }
};
