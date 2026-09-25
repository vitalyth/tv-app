import { en, type TranslationKey } from './en';
import { he } from './he';

export type AppLocale = 'en' | 'he';

let currentLocale: AppLocale = 'en';

const translations: Record<AppLocale, Record<string, string>> = {
  en,
  he,
};

export function setLocale(locale: AppLocale) {
  currentLocale = locale;
}

export function getLocale(): AppLocale {
  return currentLocale;
}

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let text = translations[currentLocale]?.[key] ?? en[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      text = text.replace(
        new RegExp(`\\{${paramKey}\\}`, 'g'),
        String(paramValue),
      );
    });
  }
  return text;
}

export const i18nConfig = {
  defaultLocale: 'en' as AppLocale,
  supportedLocales: ['en', 'he'] as AppLocale[],
  allowRtl: false,
};

export { type TranslationKey };
