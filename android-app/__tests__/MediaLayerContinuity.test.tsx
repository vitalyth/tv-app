import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { MediaLayer } from '../src/components/MediaLayer';
import { MediaControllerProvider, useMediaController } from '../src/media/MediaController';

const mockMount = jest.fn();
const mockUnmount = jest.fn();
jest.mock('../src/media/MediaSurface', () => ({
  MediaSurface: (props: any) => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => { mockMount(); return mockUnmount; }, []);
    return ReactModule.createElement('VideoSurface', props);
  },
}));
jest.mock('../src/components/RemoteImage', () => ({ RemoteImage: 'RemoteImage' }));

it('keeps one video surface and stream across fullscreen transitions and synchronizes the native paused state', () => {
  let controller!: ReturnType<typeof useMediaController>;
  function Probe() { controller = useMediaController(); return null; }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <MediaControllerProvider><Probe /><MediaLayer /></MediaControllerProvider>,
    );
  });
  const item = { id: '13', kind: 'live' as const, title: 'Reshet', imageUrl: 'https://example.com/poster.jpg' };
  const stream = { url: 'https://example.com/live.m3u8' };
  act(() => { controller.play(item, stream); controller.markPlaying(); });
  const surface = renderer.root.findByType('VideoSurface' as any);
  for (let i = 0; i < 3; i++) {
    act(() => { controller.enterFullscreen(); controller.stopAll(); });
    expect(renderer.root.findByType('VideoSurface' as any)).toBe(surface);
    expect(controller.stream).toBe(stream);
    act(() => { controller.exitFullscreen(); });
    expect(renderer.root.findByType('VideoSurface' as any)).toBe(surface);
  }
  act(() => surface.props.onPausedChange(true));
  expect(controller.paused).toBe(true);
  act(() => controller.enterFullscreen());
  expect(controller.paused).toBe(true);
  expect(renderer.root.findByType('VideoSurface' as any)).toBe(surface);
  act(() => controller.exitFullscreen());
  expect(controller.paused).toBe(true);
  act(() => surface.props.onPausedChange(false));
  expect(controller.paused).toBe(false);
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
