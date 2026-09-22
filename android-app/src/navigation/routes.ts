export const ROOT_ROUTES = [
  'home',
  'live-tv',
  'vod',
  'guide',
  'favorites',
  'search',
  'settings',
] as const;

export type RootRoute = (typeof ROOT_ROUTES)[number];

export interface RouteDefinition {
  id: RootRoute;
  label: string;
  shortLabel: string;
  eyebrow: string;
  title: string;
  description: string;
}

export const routes: readonly RouteDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    shortLabel: 'H',
    eyebrow: 'Welcome back',
    title: 'Your television, in one place',
    description:
      'Continue watching, return to live television, or discover something new.',
  },
  {
    id: 'live-tv',
    label: 'Live TV',
    shortLabel: 'TV',
    eyebrow: 'On now',
    title: 'Live television',
    description:
      'Channels and live programming will arrive in a later approved stage.',
  },
  {
    id: 'vod',
    label: 'VOD',
    shortLabel: 'V',
    eyebrow: 'On demand',
    title: 'Movies and series',
    description:
      'The VOD catalogue will be connected after the shared media foundation.',
  },
  {
    id: 'guide',
    label: 'Guide',
    shortLabel: 'G',
    eyebrow: 'Schedule',
    title: 'Program guide',
    description:
      'Browse channels and schedules without interrupting the persistent media layer.',
  },
  {
    id: 'favorites',
    label: 'Favorites',
    shortLabel: 'F',
    eyebrow: 'Your library',
    title: 'Favorites',
    description: 'Saved channels and programs will appear here.',
  },
  {
    id: 'search',
    label: 'Search',
    shortLabel: 'S',
    eyebrow: 'Find something',
    title: 'Search',
    description: 'Search across live television and on-demand content.',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'SET',
    eyebrow: 'Preferences',
    title: 'Settings',
    description:
      'Playback, language, accessibility and application preferences.',
  },
];

export const initialRoute: RootRoute = 'home';

export function getRoute(routeId: RootRoute): RouteDefinition {
  return routes.find(route => route.id === routeId) ?? routes[0];
}
