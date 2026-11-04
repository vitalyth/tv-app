import type {OnTextTracksData, SelectedTrack} from 'react-native-video';
import {SelectedTrackType} from 'react-native-video';
import type {SubtitleOption} from './player';
import {t} from '../i18n';

const LANGUAGES: Record<string, string> = {
  he: 'עברית', heb: 'עברית', iw: 'עברית',
  en: 'English', eng: 'English',
  ar: 'العربية', ara: 'العربية',
  ru: 'Русский', rus: 'Русский',
  fr: 'Français', fra: 'Français', fre: 'Français',
  es: 'Español', spa: 'Español',
};

export function subtitleOptions(tracks: OnTextTracksData['textTracks']): SubtitleOption[] {
  return tracks.filter(track => Number.isInteger(track.index) && track.index >= 0)
    .map(track => {
      const language = track.language?.trim();
      const title = track.title?.trim();
      const languageLabel = language && language !== 'und'
        ? LANGUAGES[language.toLowerCase().split('-')[0]] ?? language : undefined;
      const titleLabel = title && !/^Track \d+$/i.test(title) ? title : undefined;
      return {
        id: String(track.index), language,
        label: titleLabel ?? languageLabel ?? t('playerSubtitleNumber', {number: track.index + 1}),
      };
    });
}

export function selectedSubtitleTrack(id = 'off', disabled = false): SelectedTrack {
  if (disabled || id === 'off' || !/^\d+$/.test(id)) {
    return {type: SelectedTrackType.DISABLED};
  }
  return {type: SelectedTrackType.INDEX, value: Number(id)};
}
