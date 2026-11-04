import appStorage from './storage';
import type {SubtitleOption} from '../media/player';

const STORAGE_KEY = '@tvapp_subtitle_preferences_v1';
export interface SubtitlePreference {
  enabled: boolean;
  language?: string;
  label?: string;
}

let pendingWrite: Promise<unknown> = Promise.resolve();

function languageKey(value?: string) {
  const code = value?.toLowerCase().split(/[-_]/)[0];
  return ({heb: 'he', iw: 'he', eng: 'en', ara: 'ar', rus: 'ru', fra: 'fr', fre: 'fr', spa: 'es'} as Record<string, string>)[code ?? ''] ?? code;
}

export function preferredSubtitle(tracks: SubtitleOption[], preference: SubtitlePreference) {
  if (!preference.enabled) return undefined;
  const language = languageKey(preference.language);
  const sameLanguage = tracks.filter(track => language && language !== 'und' && languageKey(track.language) === language);
  return sameLanguage.find(track => track.label === preference.label) ?? sameLanguage[0] ??
    tracks.find(track => preference.label && track.label === preference.label) ?? tracks[0];
}

export const SubtitlePreferencesService = {
  async load(): Promise<SubtitlePreference> {
    try {
      await pendingWrite;
      const value = JSON.parse(await appStorage.getItem(STORAGE_KEY) ?? 'null');
      return value && typeof value.enabled === 'boolean'
        ? {enabled: value.enabled,
           language: typeof value.language === 'string' ? value.language : undefined,
           label: typeof value.label === 'string' ? value.label : undefined}
        : {enabled: false};
    } catch {return {enabled: false};}
  },
  save(preference: SubtitlePreference): Promise<unknown> {
    pendingWrite = pendingWrite.then(() => appStorage.setItem(STORAGE_KEY, JSON.stringify(preference))).catch(() => undefined);
    return pendingWrite;
  },
};
