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

  // Home Screen & Sections
  homeContentUnavailable: 'Home content is currently unavailable',
  continueWatching: 'Continue Watching',
  continueWatchingHeading: 'Continue Watching · {count} items',
  nowOnLiveTvHeading: 'Now on Live TV · {count} channels',
  newOnVodHeading: 'New on VOD · {count} titles',

  // Badges & Labels
  liveBadge: 'LIVE',
  vodBadge: 'VOD',
  seasonNumber: 'Season {season}',
  episodeNumber: 'Episode {episode}',
  vodProgram: 'VOD Program',

  // Navigation
  navHome: 'Home',
  navLiveTv: 'Live TV',
  navVod: 'VOD',
  navSeries: 'Series',
  navMovies: 'Movies',
  navGuide: 'Guide',
  navFavorites: 'Favorites',
  navSearch: 'Search',
  navSettings: 'Settings',
} as const;

export type TranslationKey = keyof typeof en;
