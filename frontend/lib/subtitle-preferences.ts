export const SUBTITLE_PREFERENCE_KEY = "tv-player-subtitles-v1";

export interface SubtitlePreference {
  enabled: boolean;
  language?: string;
  label?: string;
}

export function loadSubtitlePreference(): SubtitlePreference {
  try {
    const value = JSON.parse(localStorage.getItem(SUBTITLE_PREFERENCE_KEY) ?? "null");
    return value && typeof value.enabled === "boolean"
      ? {enabled: value.enabled,
         language: typeof value.language === "string" ? value.language : undefined,
         label: typeof value.label === "string" ? value.label : undefined}
      : {enabled: false};
  } catch {return {enabled: false};}
}

export function saveSubtitlePreference(preference: SubtitlePreference) {
  try {localStorage.setItem(SUBTITLE_PREFERENCE_KEY, JSON.stringify(preference));} catch {}
}

function languageKey(value?: string) {
  const code = value?.toLowerCase().split(/[-_]/)[0];
  return ({heb: "he", iw: "he", eng: "en", ara: "ar", rus: "ru", fra: "fr", fre: "fr", spa: "es"} as Record<string, string>)[code ?? ""] ?? code;
}

export function preferredSubtitle<T extends {label: string; language?: string}>(tracks: T[], preference: SubtitlePreference): T | undefined {
  if (!preference.enabled) return undefined;
  const language = languageKey(preference.language);
  const sameLanguage = tracks.filter(track => language && language !== "und" && languageKey(track.language) === language);
  return sameLanguage.find(track => track.label === preference.label) ?? sameLanguage[0] ??
    tracks.find(track => preference.label && track.label === preference.label) ?? tracks[0];
}
