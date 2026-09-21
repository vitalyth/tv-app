export const en = {
  title: 'TV App v2',
  foundation: 'Foundation diagnostics',
  platform: 'Detected platform',
  api: 'Backend API',
  channels: 'Live channels',
  connected: 'Connected',
  loading: 'Checking connection',
  error: 'Connection failed',
  reload: 'Reload API test',
  focusTest: 'Remote focus test',
  lastEvent: 'Last remote event',
  noEvent: 'None yet',
} as const;

export type TranslationKey = keyof typeof en;
