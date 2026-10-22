import type { ImageSourcePropType } from 'react-native';
import { SERVICE_BASE_URL } from '../config/api';

// Native image decoders cannot use the SVG logos served by the web frontend.
const logos: Record<string, ImageSourcePropType> = {
  '/ch/16tv.jpg': require('../assets/channel-logos/16tv.png'),
  '/ch/cnn.svg': require('../assets/channel-logos/cnn.png'),
  '/ch/wcvb.svg': require('../assets/channel-logos/wcvb.png'),
  '/ch/ftv-white.svg': require('../assets/channel-logos/ftv-white.png'),
};

export function getBundledChannelLogo(uri: string): ImageSourcePropType | undefined {
  try {
    const url = new URL(uri, SERVICE_BASE_URL) as unknown as {
      origin: string;
      pathname: string;
    };
    // React Native's URL implementation adds a slash to absolute file URLs.
    return url.origin === SERVICE_BASE_URL
      ? logos[url.pathname.replace(/\/$/, '')]
      : undefined;
  } catch {
    return undefined;
  }
}
