import { VegaShakaPlayer, getVegaRequestUri } from '../platforms/vega/src/media/vega/VegaShakaPlayer';

jest.mock('@amazon-devices/react-native-w3cmedia/dist/headless', () => ({}), { virtual: true });
jest.mock('@amazon-devices/react-native-w3cmedia/dist/TextTrackImpl', () => ({}), { virtual: true });

describe('Vega live seek target', () => {
  const media = { currentTime: 0 };
  const player = Object.create(VegaShakaPlayer.prototype) as VegaShakaPlayer;

  beforeEach(() => {
    Object.assign(player, {
      mediaElement: media,
      player: { isLive: () => true, seekRange: () => ({ start: 100, end: 200 }) },
    });
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns to a playable point behind the advancing live edge', () => {
    player.seekTo(200);
    expect(media.currentTime).toBe(197);
    (player as any).player.seekRange = () => ({ start: 106, end: 206 });
    player.seekTo(206);
    expect(media.currentTime).toBe(203);
  });

  it('preserves rewind targets inside the stream window', () => {
    player.seekTo(150);
    expect(media.currentTime).toBe(150);
    player.seekTo(90);
    expect(media.currentTime).toBe(100);
  });

  it('does not apply live edge offsets to VOD', () => {
    (player as any).player.isLive = () => false;
    player.seekTo(200);
    expect(media.currentTime).toBe(200);
  });
});

describe('Vega stream request routing', () => {
  it('preserves all signed Mako parameters without nesting the URI in a proxy query', () => {
    const upstream = 'https://mako-streaming.akamaized.net/live/master.m3u8?_uid=test&rK=b1&_did=device';
    const proxy = `https://tv.bestcams.net/api/proxy?url=${encodeURIComponent(upstream)}&referer=https%3A%2F%2Ftv.bestcams.net%2F`;
    expect(getVegaRequestUri(proxy)).toBe(upstream);
  });

  it('preserves VPN proxy requests and other providers', () => {
    const urls = [
      'https://tv.bestcams.net/api/v/proxy?url=https%3A%2F%2Fmako-streaming.akamaized.net%2Flive.m3u8',
      'https://tv.bestcams.net/api/proxy?url=https%3A%2F%2Fexample.com%2Flive.m3u8',
    ];
    urls.forEach(uri => expect(getVegaRequestUri(uri)).toBe(uri));
  });
});
