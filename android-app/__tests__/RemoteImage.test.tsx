import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { RemoteImage } from '../src/components/RemoteImage';
import { getBundledChannelLogo } from '../src/components/channelLogoAssets';
import { SERVICE_BASE_URL } from '../src/config/api';

describe('native channel logo images', () => {
  let renderer: Renderer.ReactTestRenderer;
  afterEach(() => { if (renderer) { act(() => renderer.unmount()); } });
  const image = () => renderer.root.findByType(Image);

  it.each(['16tv.jpg', 'cnn.svg', 'wcvb.svg', 'ftv-white.svg'])(
    'loads %s from a real bundled PNG without requesting an invented URL', filename => {
      const uri = `${SERVICE_BASE_URL}/ch/${filename}`;
      act(() => { renderer = Renderer.create(<RemoteImage uri={uri} resizeMode="contain" />); });
      expect(getBundledChannelLogo(uri)).toBeDefined();
      expect(image().props.source).toEqual(getBundledChannelLogo(uri));
      expect(image().props.resizeMode).toBe('contain');
    },
  );

  it('handles relative logo paths and query parameters without overriding other hosts', () => {
    expect(getBundledChannelLogo('/ch/cnn.svg?version=2')).toEqual(getBundledChannelLogo(`${SERVICE_BASE_URL}/ch/cnn.svg`));
    expect(getBundledChannelLogo('https://other.example/ch/cnn.svg')).toBeUndefined();
    expect(getBundledChannelLogo(`${SERVICE_BASE_URL}/not-ch/cnn.svg`)).toBeUndefined();
    expect(getBundledChannelLogo('http://[')).toBeUndefined();
  });

  it('also resolves logos with the native URL implementation used on TV', () => {
    const original = globalThis.URL;
    // Exercise the TV polyfill rather than Jest's Node URL implementation.
    // eslint-disable-next-line @react-native/no-deep-imports
    const nativeURL = require('react-native/Libraries/Blob/URL').URL;
    try {
      globalThis.URL = nativeURL;
      for (const name of ['16tv.jpg', 'cnn.svg', 'wcvb.svg', 'ftv-white.svg']) {
        expect(getBundledChannelLogo(`${SERVICE_BASE_URL}/ch/${name}`)).toBeDefined();
        expect(getBundledChannelLogo(`${SERVICE_BASE_URL}/ch/${name}?v=2`)).toBeDefined();
      }
    } finally { globalThis.URL = original; }
  });

  it('leaves other images intact, and uses the bundled logo if remote artwork fails', () => {
    const uri = 'https://example.com/artwork.jpg';
    const fallbackUri = `${SERVICE_BASE_URL}/ch/wcvb.svg`;
    const onError = jest.fn();
    act(() => { renderer = Renderer.create(<RemoteImage uri={uri} fallbackUri={fallbackUri} onError={onError} />); });
    expect(image().props.source).toMatchObject({ uri });
    act(() => image().props.onError({ nativeEvent: { error: 'HTTP 404' } }));
    expect(image().props.source).toEqual(getBundledChannelLogo(fallbackUri));
    expect(onError).not.toHaveBeenCalled();
    act(() => image().props.onError({ nativeEvent: { error: 'decode' } }));
    expect(onError).toHaveBeenCalledTimes(1);
    act(() => renderer.update(<RemoteImage uri="https://example.com/new.jpg" fallbackUri={fallbackUri} />));
    expect(image().props.source).toMatchObject({ uri: 'https://example.com/new.jpg' });
  });

  it('does not rename an unknown SVG to a nonexistent PNG and preserves error fallback', () => {
    const uri = 'https://example.com/other.svg';
    act(() => { renderer = Renderer.create(<RemoteImage uri={uri} fallbackUri="https://example.com/fallback.jpg" />); });
    expect(image().props.source).toMatchObject({ uri });
    act(() => image().props.onError({ nativeEvent: { error: 'unsupported' } }));
    expect(image().props.source).toMatchObject({ uri: 'https://example.com/fallback.jpg' });
  });
});
