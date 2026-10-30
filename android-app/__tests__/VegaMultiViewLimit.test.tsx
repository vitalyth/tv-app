import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useTVEventHandler } from 'react-native';
import { MediaControllerProvider, useMediaController } from '../src/media/MediaController';
import { MultiViewPlayer } from '../src/components/player/MultiViewPlayer';
import { MULTIVIEW_MAX_STREAMS } from '../src/media/multiViewLayout';

jest.mock('../src/platform/runtime', () => ({ tvPlatform: { id: 'kepler' } }));
jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true, default: jest.fn(),
}));
jest.mock('../src/components/RemoteImage', () => ({ RemoteImage: 'RemoteImage' }));
jest.mock('../src/api/channels', () => ({
  getPlayableLiveChannels: jest.fn(async () => []),
  resolveLiveChannelStream: jest.fn(),
}));

it('caps Vega at two streams in both controller and channel-add UI, while permitting replacement', async () => {
  expect(MULTIVIEW_MAX_STREAMS).toBe(2);
  let controller!: ReturnType<typeof useMediaController>;
  function Harness() {
    controller = useMediaController();
    return controller.multiView ? <MultiViewPlayer /> : null;
  }
  const item = (id: string) => ({ id, kind: 'live' as const, title: id });
  const stream = (id: string) => ({ url: `https://example.com/${id}.m3u8` });
  let renderer!: Renderer.ReactTestRenderer;
  try {
    await act(async () => { renderer = Renderer.create(<MediaControllerProvider><Harness /></MediaControllerProvider>); });
    await act(async () => { controller.playFullscreen(item('11'), stream('11')); controller.markPlaying(); });
    await act(async () => { controller.enterMultiView(); });
    await act(async () => { controller.setMultiViewBackend('software'); });
    expect(controller.multiView?.backend).toBeUndefined();
    await act(async () => { controller.setMultiViewChannel(item('12'), stream('12'), 1); controller.markMultiViewPlaying(1); });
    await act(async () => { controller.setMultiViewChannel(item('13'), stream('13'), 2); });
    expect(controller.multiView?.tiles.map(tile => tile.item.id)).toEqual(['12']);
    // Close the initial picker, move to the second tile, and try to add another.
    const key = async (eventType: string) => act(async () => {
      jest.mocked(useTVEventHandler).mock.lastCall![0]({ eventType, eventKeyAction: 0 });
    });
    await key('right');
    await key('right');
    await key('right');
    expect(renderer.root.findAll(node => typeof node.props.onSelectChannel === 'function')).toHaveLength(0);
    await act(async () => { controller.setMultiViewChannel(item('13'), stream('13'), 1); });
    expect(controller.multiView?.tiles.map(tile => tile.item.id)).toEqual(['13']);
    expect(controller.item?.id).toBe('11');
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});
