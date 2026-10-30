import type { ImageSourcePropType } from 'react-native';
import { SERVICE_BASE_URL } from '../config/api';

// Native image decoders cannot use the SVG logos served by the web frontend.
const logos: Record<string, ImageSourcePropType> = {
  '/ch/16tv.jpg': require('../assets/channel-logos/16tv.png'),
  '/ch/cnn.svg': require('../assets/channel-logos/cnn.png'),
  '/ch/wcvb.svg': require('../assets/channel-logos/wcvb.png'),
  '/ch/ftv-white.svg': require('../assets/channel-logos/ftv-white.png'),
  '/ch/sport-1-square.svg': require('../assets/channel-logos/sport-1-square.png'),
  '/ch/sport-2-square.svg': require('../assets/channel-logos/sport-2-square.png'),
  '/ch/sport-3-square.svg': require('../assets/channel-logos/sport-3-square.png'),
  '/ch/sport-4-square.svg': require('../assets/channel-logos/sport-4-square.png'),
  '/ch/one-1-square.svg': require('../assets/channel-logos/one-1-square.png'),
  '/ch/one-2-square.svg': require('../assets/channel-logos/one-2-square.png'),
  '/ch/sport-5-square.svg': require('../assets/channel-logos/sport-5-square.png'),
  '/ch/sport-5-live-square.svg': require('../assets/channel-logos/sport-5-live-square.png'),
  '/ch/sport-5-plus-square.svg': require('../assets/channel-logos/sport-5-plus-square.png'),
  '/ch/sport-5-gold-square.svg': require('../assets/channel-logos/sport-5-gold-square.png'),
  '/ch/sport-5-stars-square.svg': require('../assets/channel-logos/sport-5-stars-square.png'),
  // Max's SVG embeds WebP artwork; its PNG must include that embedded image.
  '/ch/sport-5-max-square.svg': require('../assets/channel-logos/sport-5-max-square.png'),
  '/ch/eurosport-1-square.svg': require('../assets/channel-logos/eurosport-1-square.png'),
  '/ch/eurosport-2-square.svg': require('../assets/channel-logos/eurosport-2-square.png'),
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
