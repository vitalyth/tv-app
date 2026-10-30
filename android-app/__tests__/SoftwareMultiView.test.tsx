import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import { MediaLayer } from '../src/components/MediaLayer';
import { multiViewMaxStreams } from '../src/media/multiViewLayout';

jest.mock('../src/platform/runtime', () => ({ tvPlatform: { id: 'kepler' } }));
jest.mock('../src/media/nativeMultiView', () => ({
  softwareMultiViewAvailable: true,
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));
jest.mock('../src/media/MediaSurface', () => ({
  MediaSurface: 'HardwareVideo',
}));
jest.mock('../src/media/MultiViewSurface', () => ({
  MultiViewSurface: 'SoftwareGrid',
}));

it('keeps the two-stream default, opts into four software tiles, and restores the normal player', async () => {
  let controller!: ReturnType<typeof useMediaController>;
  function Harness() {
    controller = useMediaController();
    return <MediaLayer />;
  }
  const item = (id: string) => ({ id, kind: 'live' as const, title: id });
  const stream = (id: string) => ({ url: `https://example.com/${id}.m3u8` });
  let renderer!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = Renderer.create(
        <MediaControllerProvider>
          <Harness />
        </MediaControllerProvider>,
      );
    });
    await act(async () => {
      controller.playFullscreen(item('11'), stream('11'));
    });
    await act(async () => {
      controller.markPlaying();
      controller.enterMultiView();
    });
    expect(multiViewMaxStreams(controller.multiView?.backend)).toBe(2);
    await act(async () => {
      controller.setMultiViewBackend('software');
    });
    expect(controller.status).toBe('loading');
    expect(multiViewMaxStreams(controller.multiView?.backend)).toBe(4);
    for (let index = 1; index <= 3; index++) {
      await act(async () =>
        controller.setMultiViewChannel(
          item(String(11 + index)),
          stream(String(11 + index)),
          index,
        ),
      );
    }
    await act(async () =>
      controller.setMultiViewChannel(item('15'), stream('15'), 4),
    );
    expect(controller.multiView?.tiles).toHaveLength(3);
    expect(controller.multiView?.backend).toBe('software');
    expect(renderer.root.findAllByType('HardwareVideo' as any)).toHaveLength(0);
    const grid = () => renderer.root.findByType('SoftwareGrid' as any);
    expect(grid().props.streams).toHaveLength(4);
    await act(async () => {
      grid().props.onTileState(0, 'playing');
      grid().props.onTileState(2, 'playing');
    });
    await act(async () => controller.setMultiViewAudio(2));
    expect(grid().props.audioTile).toBe(2);
    await act(async () => controller.setPaused(true));
    expect(grid().props.paused).toBe(true);
    await act(async () => controller.setMultiViewBackend('platform'));
    expect(controller.multiView?.backend).toBe('software');
    await act(async () => controller.markMultiViewError(2));
    expect(controller.multiView?.backend).toBe('software');
    expect(controller.multiView?.audioTile).toBe(-1);
    await act(async () => controller.removeMultiViewChannel(3));
    expect(controller.multiView?.backend).toBe('software');
    await act(async () => controller.exitMultiView());
    expect(renderer.root.findAllByType('SoftwareGrid' as any)).toHaveLength(0);
    expect(renderer.root.findAllByType('HardwareVideo' as any)).toHaveLength(1);
  } finally {
    await act(async () => renderer.unmount());
  }
});
