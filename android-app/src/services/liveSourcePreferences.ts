import appStorage from './storage';

const STORAGE_KEY = '@tvapp_live_source_preferences_v1';

let preferencesPromise: Promise<Record<string, string>> | undefined;

function parsePreferences(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function readPreferences(): Promise<Record<string, string>> {
  if (!preferencesPromise) {
    preferencesPromise = appStorage
      .getItem(STORAGE_KEY)
      .then(parsePreferences, () => ({}));
  }
  return preferencesPromise;
}

export const LiveSourcePreferencesService = {
  getSourceId(channelId: string): Promise<string | undefined> {
    if (!channelId) {
      return Promise.resolve(undefined);
    }
    return readPreferences().then(preferences => {
      const sourceId = preferences[channelId];
      return typeof sourceId === 'string' && sourceId ? sourceId : undefined;
    });
  },

  setSourceId(channelId: string, sourceId: string): Promise<boolean> {
    if (!channelId || !sourceId) {
      return Promise.resolve(false);
    }
    return readPreferences().then(preferences => {
      preferences[channelId] = sourceId;
      return appStorage
        .setItem(STORAGE_KEY, JSON.stringify(preferences))
        .then(() => true, () => false);
    });
  },

  resetCache(): void {
    preferencesPromise = undefined;
  },
};
