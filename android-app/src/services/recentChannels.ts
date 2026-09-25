import appStorage, { StorageAdapter } from './storage';

const STORAGE_KEY = '@tvapp_recent_live_channels_v1';
const MAX_RECENT_CHANNELS = 30;

let memoryStore: Record<string, string> = {};

export type { StorageAdapter };

const defaultStorage: StorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const val = await appStorage.getItem(key);
      if (val !== null && val !== undefined) {
        return val;
      }
    } catch {
      // Fall through to memory store
    }
    return memoryStore[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memoryStore[key] = value;
    try {
      await appStorage.setItem(key, value);
    } catch {
      // Ignore write failures
    }
  },
  async removeItem(key: string): Promise<void> {
    delete memoryStore[key];
    try {
      await appStorage.removeItem(key);
    } catch {
      // Ignore remove failures
    }
  },
};

let activeStorage: StorageAdapter = defaultStorage;

export function setRecentChannelsStorage(adapter: StorageAdapter) {
  activeStorage = adapter;
}

export function resetRecentChannelsMemoryStore() {
  memoryStore = {};
}

export const RecentChannelsService = {
  async getRecentChannelIds(): Promise<string[]> {
    try {
      const raw = await activeStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(id => typeof id === 'string' && id.trim().length > 0);
    } catch {
      return [];
    }
  },

  async recordChannelWatched(channelId: string): Promise<boolean> {
    if (!channelId || typeof channelId !== 'string') {
      return false;
    }
    const cleanId = channelId.trim();
    if (!cleanId) {
      return false;
    }

    try {
      const currentList = await this.getRecentChannelIds();
      // Filter out existing occurrence
      const updated = [cleanId, ...currentList.filter(id => id !== cleanId)].slice(
        0,
        MAX_RECENT_CHANNELS,
      );
      await activeStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  },

  async clearRecentChannels(): Promise<boolean> {
    try {
      await activeStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },
};
