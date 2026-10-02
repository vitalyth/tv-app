import appStorage from './storage';

const STORAGE_KEY = '@tvapp_live_source_preferences_v1';

async function readPreferences(): Promise<Record<string, string>> {
  try {
    const raw = await appStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export const LiveSourcePreferencesService = {
  async getSourceId(channelId: string): Promise<string | undefined> {
    if (!channelId) {
      return undefined;
    }
    const preferences = await readPreferences();
    const sourceId = preferences[channelId];
    return typeof sourceId === 'string' && sourceId ? sourceId : undefined;
  },

  async setSourceId(channelId: string, sourceId: string): Promise<boolean> {
    if (!channelId || !sourceId) {
      return false;
    }
    try {
      const preferences = await readPreferences();
      preferences[channelId] = sourceId;
      await appStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      return true;
    } catch {
      return false;
    }
  },
};
