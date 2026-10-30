import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MultiViewSurface } from '../src/media/MultiViewSurface.kepler';

const mockPlayers: any[] = [];
const mockShaka: any[] = [];
jest.mock(
  '@amazon-devices/react-native-kepler/Libraries/Utilities/registerGeneratedViewConfig',
  () => jest.fn(),
  { virtual: true },
);
jest.mock(
  '@amazon-devices/react-native-w3cmedia/dist/headless',
  () => ({
    VideoPlayer: jest.fn().mockImplementation(() => {
      const player = {
        initialize: jest.fn(async () => {}),
        deinitializeSync: jest.fn(),
        pause: jest.fn(),
        play: jest.fn(async () => {}),
        muted: true,
      };
      mockPlayers.push(player);
      return player;
    }),
  }),
  { virtual: true },
);
jest.mock('../src/media/MediaSurface.kepler', () => ({
  waitForMediaRelease: jest.fn(async () => {}),
  registerMediaTeardown: jest.fn((work: Promise<void>) => work),
}));
jest.mock('../platforms/vega/src/media/vega/VegaShakaPlayer', () => ({
  getVegaRequestUri: (url: string) => url,
  VegaShakaPlayer: jest
    .fn()
    .mockImplementation((_player, _error, _qualities, audioOnly) => {
      const shaka = {
        audioOnly,
        load: jest.fn(async () => {}),
        destroy: jest.fn(async () => {}),
      };
      mockShaka.push(shaka);
      return shaka;
    }),
}));

it('keeps all video sources mounted when audio focus changes and ignores obsolete tile events', async () => {
  const streams = Array.from({ length: 4 }, (_, index) => ({
    url: `https://example.com/${index}.m3u8`,
  }));
  const report = jest.fn();
  let renderer!: Renderer.ReactTestRenderer;
  const render = (audioTile: number, paused = false) => (
    <MultiViewSurface
      streams={streams}
      audioTile={audioTile}
      paused={paused}
      onTileState={report}
    />
  );
  try {
    await act(async () => {
      renderer = Renderer.create(render(0));
    });
    const native = () => renderer.root.findByType('TvAppVlcView' as any);
    const firstView = native();
    expect(mockShaka[0].audioOnly).toBe(true);
    expect(mockShaka[0].load).toHaveBeenCalledWith(streams[0].url, 'm3u8');
    await act(async () => renderer.update(render(2)));
    expect(native()).toBe(firstView);
    expect(native().props.source3).toBe(streams[3].url);
    expect(mockPlayers[0].muted).toBe(true);
    expect(mockShaka[0].destroy).toHaveBeenCalled();
    expect(mockShaka[1].audioOnly).toBe(true);
    expect(mockShaka[1].load).toHaveBeenCalledWith(streams[2].url, 'm3u8');
    await act(async () => renderer.update(render(2, true)));
    expect(native().props.paused).toBe(true);
    expect(mockPlayers[1].pause).toHaveBeenCalled();
    native().props.onTileState({
      nativeEvent: { index: 1, state: 'playing', source: 'old-url' },
    });
    expect(report).not.toHaveBeenCalled();
    native().props.onTileState({
      nativeEvent: { index: 1, state: 'playing', source: streams[1].url },
    });
    expect(report).toHaveBeenCalledWith(1, 'playing');
    await act(async () => renderer.update(render(-1)));
    expect(mockPlayers[1].muted).toBe(true);
    expect(mockPlayers[1].deinitializeSync).toHaveBeenCalledWith(2000);
  } finally {
    await act(async () => renderer.unmount());
  }
});
