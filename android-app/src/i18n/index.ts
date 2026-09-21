import {en, type TranslationKey} from './en';

export type AppLocale = 'en' | 'he';

export function t(key: TranslationKey): string {
  return en[key];
}

export const i18nConfig = {
  defaultLocale: 'en' as AppLocale,
  supportedLocales: ['en', 'he'] as AppLocale[],
  allowRtl: true,
};
