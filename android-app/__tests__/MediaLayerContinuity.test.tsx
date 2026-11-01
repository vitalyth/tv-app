import {Animated} from 'react-native';
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

it('shrinks and restores the existing player for the channel drawer without resetting playback', () => {
  const timing = jest.spyOn(Animated, 'timing');
  let controller!: ReturnType<typeof useMediaController>;
  function Probe() {controller = useMediaController(); return null;}
  function Harness({open}: {open: boolean}) {
    return <MediaControllerProvider><Probe /><MediaLayer channelDrawerOpen={open} /></MediaControllerProvider>;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {renderer = ReactTestRenderer.create(<Harness open={false} />);});
  const stream = {url: 'https://example.com/drawer-live.m3u8'};
  act(() => {
    controller.playFullscreen({id: 'drawer-live', kind: 'live', title: 'Live'}, stream);
    controller.markPlaying();
    controller.setPaused(true);
    controller.setSelectedQuality('720');
  });
  const surface = renderer.root.findByType('VideoSurface' as any);
  const onFirstFrame = surface.props.onFirstFrame;
  for (const open of [true, false, true, false]) {
    act(() => {renderer.update(<Harness open={open} />);});
    expect(renderer.root.findByType('VideoSurface' as any)).toBe(surface);
    expect(controller.stream).toBe(stream);
    expect(controller.paused).toBe(true);
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({toValue: open ? 1 : 0, duration: 260, useNativeDriver: true}));
    expect(surface.props.selectedQualityId).toBe('720');
    expect(surface.props.onFirstFrame).toBe(onFirstFrame);
  }
  act(() => {renderer.unmount();});
  timing.mockRestore();
});
