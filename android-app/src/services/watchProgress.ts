export interface ContinueWatchingItem {
  id: string;
  episodeId: string;
  seriesId?: string | null;
  title: string;
  seriesTitle?: string | null;
  channelName?: string | null;
  imageUrl?: string | null;
  backdropUrl?: string | null;
  positionMs: number;
  durationMs: number;
  progressPercentage: number;
  lastWatchedAt: number;
  streamUrl?: string | null;
  sourcePayload?: unknown;
}

export interface SaveProgressParams {
  episodeId: string;
  seriesId?: string | null;
  title: string;
  seriesTitle?: string | null;
  channelName?: string | null;
  imageUrl?: string | null;
  backdropUrl?: string | null;
  positionMs: number;
  durationMs: number;
  streamUrl?: string | null;
  sourcePayload?: unknown;
}

const STORAGE_KEY = '@tvapp_watch_progress_v1';
const COMPLETION_PERCENTAGE_THRESHOLD = 92;
const COMPLETION_REMAINING_MS_THRESHOLD = 25000; // 25 seconds

// In-memory backing store for instant access and testing environments
let memoryStore: Record<string, string> = {};

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

function getLocalStorage(): {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} | undefined {
  try {
    const g = globalThis as unknown as {
      localStorage?: {
        getItem: (k: string) => string | null;
        setItem: (k: string, v: string) => void;
        removeItem: (k: string) => void;
      };
    };
    return typeof g.localStorage !== 'undefined' ? g.localStorage : undefined;
  } catch {
    return undefined;
  }
}

const defaultStorage: StorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const storage = getLocalStorage();
    if (storage) {
      try {
        return storage.getItem(key);
      } catch {
        // Fall back to memory
      }
    }
    return memoryStore[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memoryStore[key] = value;
    const storage = getLocalStorage();
    if (storage) {
      try {
        storage.setItem(key, value);
      } catch {
        // Ignore write failures
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    delete memoryStore[key];
    const storage = getLocalStorage();
    if (storage) {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore remove failures
      }
    }
  },
};

let activeStorage: StorageAdapter = defaultStorage;

export function setWatchProgressStorage(adapter: StorageAdapter) {
  activeStorage = adapter;
}

export function resetWatchProgressMemoryStore() {
  memoryStore = {};
}

export function isItemCompleted(positionMs: number, durationMs: number): boolean {
  if (durationMs <= 0 || positionMs <= 0) {
    return false;
  }
  const percentage = (positionMs / durationMs) * 100;
  const remainingMs = durationMs - positionMs;
  return (
    percentage >= COMPLETION_PERCENTAGE_THRESHOLD ||
    remainingMs <= COMPLETION_REMAINING_MS_THRESHOLD
  );
}

export const WatchProgressService = {
  async getContinueWatching(): Promise<ContinueWatchingItem[]> {
    try {
      const raw = await activeStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      // Filter out completed items and sort by lastWatchedAt descending
      return parsed
        .filter(
          (item: ContinueWatchingItem) =>
            item &&
            typeof item === 'object' &&
            item.episodeId &&
            !isItemCompleted(item.positionMs, item.durationMs),
        )
        .sort(
          (a: ContinueWatchingItem, b: ContinueWatchingItem) =>
            (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0),
        );
    } catch {
      return [];
    }
  },

  async getProgress(
    episodeId: string,
  ): Promise<{ positionMs: number; durationMs: number; isCompleted: boolean } | null> {
    if (!episodeId) {
      return null;
    }
    const all = await this.getContinueWatching();
    const match = all.find(item => item.episodeId === episodeId);
    if (!match) {
      return null;
    }
    return {
      positionMs: match.positionMs,
      durationMs: match.durationMs,
      isCompleted: isItemCompleted(match.positionMs, match.durationMs),
    };
  },

  async saveProgress(params: SaveProgressParams): Promise<boolean> {
    const { episodeId, positionMs, durationMs } = params;
    if (!episodeId || positionMs === undefined || durationMs === undefined) {
      return false;
    }

    try {
      const raw = await activeStorage.getItem(STORAGE_KEY);
      let list: ContinueWatchingItem[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) {
        list = [];
      }

      // Remove existing entry for this episode
      list = list.filter(item => item.episodeId !== episodeId);

      // If item is already completed, do not re-add to continue watching
      if (!isItemCompleted(positionMs, durationMs)) {
        const progressPercentage =
          durationMs > 0 ? Math.round((positionMs / durationMs) * 100) : 0;
        const entry: ContinueWatchingItem = {
          id: `cw-${episodeId}`,
          episodeId,
          seriesId: params.seriesId,
          title: params.title,
          seriesTitle: params.seriesTitle,
          channelName: params.channelName,
          imageUrl: params.imageUrl,
          backdropUrl: params.backdropUrl,
          positionMs,
          durationMs,
          progressPercentage,
          lastWatchedAt: Date.now(),
          streamUrl: params.streamUrl,
          sourcePayload: params.sourcePayload,
        };
        list.unshift(entry);
      }

      // Limit to 30 most recent items to avoid unbounded storage growth
      list = list.slice(0, 30);
      await activeStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  },

  async removeProgress(episodeId: string): Promise<boolean> {
    if (!episodeId) {
      return false;
    }
    try {
      const raw = await activeStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return true;
      }
      let list: ContinueWatchingItem[] = JSON.parse(raw);
      if (!Array.isArray(list)) {
        return true;
      }
      list = list.filter(item => item.episodeId !== episodeId);
      await activeStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  },
};
