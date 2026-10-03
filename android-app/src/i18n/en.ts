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
  continueWatchingHeading: 'Continue Watching',
  nowOnLiveTvHeading: 'Now on Live TV',
  newOnVodHeading: 'New on VOD',

  // Badges & Labels
  liveBadge: 'LIVE',
  vodBadge: 'VOD',
  seasonNumber: 'Season {season}',
  episodeNumber: 'Episode {episode}',
  vodProgram: 'VOD Program',

  // Player
  playerSources: 'Sources',
  playerSourceDialogTitle: 'Broadcast sources',
  playerNoAlternateSources:
    'No additional sources are available for this channel.',
  playerSourceConnecting: 'Connecting...',
  playerSourceActive: 'Active',
  playerSourceAvailable: 'Available',
  playerSourceUnavailable: 'The selected source is unavailable.',
  playerSourceNumber: 'Source {number}',
  playerMultiView: 'Multi View',
  playerMultiViewUnavailable:
    'Watching multiple channels in parallel (Multi View) will be available in the next stage.',
  playerQuality: 'Quality',
  playerVideoQuality: 'Video quality',
  close: 'Close',

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
