import { VegaShakaPlayer, getVegaRequestUri } from '../platforms/vega/src/media/vega/VegaShakaPlayer';

// Jest provides the complete Node URL implementation, unlike RN's TS declarations.
const TestURL = URL as any;

jest.mock('@amazon-devices/react-native-w3cmedia/dist/headless', () => ({}), { virtual: true });
jest.mock('@amazon-devices/react-native-w3cmedia/dist/TextTrackImpl', () => ({}), { virtual: true });

describe('Vega tile quality', () => {
  it('forces the lowest real rendition in tile mode, even when Auto is requested, and restores Auto on exit', () => {
    const wrapper = Object.create(VegaShakaPlayer.prototype) as VegaShakaPlayer;
    const tracks = [
      { id: 1, height: 1080, bandwidth: 4000000, active: true },
      { id: 2, height: 360, bandwidth: 600000 },
      { id: 3, height: 360, bandwidth: 400000 },
    ];
    const native = { configure: jest.fn(), getVariantTracks: () => tracks, selectVariantTrack: jest.fn() };
    Object.assign(wrapper, { player: native, logActiveQuality: jest.fn() });
    jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      wrapper.setPlaybackLimits(180, 260000);
      expect(native.selectVariantTrack).toHaveBeenLastCalledWith(tracks[2], true);
      wrapper.selectQuality('auto');
      expect(native.configure).toHaveBeenLastCalledWith({ abr: { enabled: false } });
      wrapper.setPlaybackLimits(undefined, undefined);
      expect(native.configure).toHaveBeenLastCalledWith({ abr: { enabled: true } });
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('Vega live seek target', () => {
  const media = { currentTime: 0 };
  const player = Object.create(VegaShakaPlayer.prototype) as VegaShakaPlayer;

  beforeEach(() => {
    media.currentTime = 0;
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

  it.each([
    { start: 0, end: 0 },
    { start: -10, end: 200 },
    { start: 200, end: 100 },
    { start: 0, end: Infinity },
    { start: NaN, end: 200 },
  ])('does not seek live with an invalid window %j', range => {
    (player as any).player.seekRange = () => range;
    player.seekTo(150);
    expect(media.currentTime).toBe(0);
  });

  it('clamps an old target to the latest sliding window', () => {
    (player as any).player.seekRange = () => ({ start: 160, end: 260 });
    player.seekTo(110);
    expect(media.currentTime).toBe(160);
  });

  it('keeps the live target inside a short window', () => {
    (player as any).player.seekRange = () => ({ start: 100, end: 102 });
    player.seekTo(102);
    expect(media.currentTime).toBe(101);
  });

  it.each([NaN, Infinity, -1])('ignores invalid seek target %s', target => {
    player.seekTo(target);
    expect(media.currentTime).toBe(0);
  });
});

describe('Vega stream request routing', () => {
  it('does not use Vega URL.href when serializing edited queries', () => {
    const originalURL = globalThis.URL;
    class VegaURL extends TestURL {
      get href() { return `${super.href}&${this.searchParams.toString()}`; }
    }
    try {
      globalThis.URL = VegaURL as any;
      const upstream = 'https://example.com/playlist.m3u8?bitrate=1628000';
      const broken = `https://tv.bestcams.net/api/v/proxy?url=${encodeURIComponent(upstream)}&audioId=1&videoId=2&vpn=true`;
      const repaired = new TestURL(getVegaRequestUri(broken));
      const target = new TestURL(repaired.searchParams.get('url'));
      expect(target.searchParams.get('audioId')).toBe('1');
      expect(target.searchParams.get('videoId')).toBe('2');
      expect(repaired.searchParams.getAll('url')).toHaveLength(1);
      expect(repaired.searchParams.has('videoId')).toBe(false);
    } finally {
      globalThis.URL = originalURL;
    }
  });

  it.each(['/api/proxy', '/api/v/proxy'])('repairs nested variant parameters after Shaka rebuilds %s refresh queries', path => {
    const upstream = 'https://n-121-5.il.cdn-redge.media/livehls/channel/playlist.m3u8?bitrate=1628000&audioId=1&videoId=2&dvr=21600';
    const original = new TestURL(`https://tv.bestcams.net${path}`);
    original.searchParams.set('url', upstream);
    original.searchParams.set('referer', 'https://tv.bestcams.net/');
    original.searchParams.set('vpn', 'true');
    // Match Shaka's refresh query decode followed by URI-level encoding.
    const rebuilt = `${original.origin}${original.pathname}?${encodeURI(decodeURIComponent(original.search.slice(1))).replace(/\?/g, '%3F')}`;
    const repaired = new TestURL(getVegaRequestUri(rebuilt));
    expect(repaired.searchParams.get('url')).toBe(upstream);
    expect(repaired.pathname).toBe(path);
    expect(repaired.searchParams.get('vpn')).toBe('true');
    expect(repaired.searchParams.has('audioId')).toBe(false);
    expect(repaired.searchParams.has('videoId')).toBe(false);
    expect(repaired.searchParams.has('dvr')).toBe(false);
    expect(getVegaRequestUri(repaired.href)).toBe(repaired.href);
  });

  it('forwards LL-HLS refresh parameters to the upstream without changing proxy routing', () => {
    const upstream = 'https://example.com/live.m3u8?token=keep%26signed';
    const proxy = new TestURL(`https://tv.bestcams.net/api/v/proxy?url=${encodeURIComponent(upstream)}&vpn=true`);
    proxy.searchParams.set('_HLS_msn', '123');
    proxy.searchParams.set('_HLS_part', '4');
    proxy.searchParams.set('_HLS_skip', 'YES');
    const repaired = new TestURL(getVegaRequestUri(proxy.href));
    const target = new TestURL(repaired.searchParams.get('url')!);
    expect(target.searchParams.get('token')).toBe('keep&signed');
    expect(target.searchParams.get('_HLS_msn')).toBe('123');
    expect(target.searchParams.get('_HLS_part')).toBe('4');
    expect(target.searchParams.get('_HLS_skip')).toBe('YES');
    expect(repaired.searchParams.get('vpn')).toBe('true');
    expect(repaired.searchParams.has('_HLS_msn')).toBe(false);
  });

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
