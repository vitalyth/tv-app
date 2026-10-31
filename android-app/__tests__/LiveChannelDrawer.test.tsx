import { liveEpgStore } from '../src/state/liveEpg';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, useTVEventHandler } from 'react-native';
import { LiveChannelDrawer } from '../src/components/player/LiveChannelDrawer';
import type { MediaItem } from '../src/media/player';

jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));

describe('fullscreen live channel list', () => {
  const channels: MediaItem[] = Array.from({ length: 50 }, (_, i) => ({
    id: `ch${i}`,
    kind: 'live',
    title: `Program ${i}`,
    channelName: `Channel ${i}`,
    channelNumber: String(i),
    imageUrl: `https://example.com/program-${i}.jpg`,
  }));
  let renderer: Renderer.ReactTestRenderer;
  const select = jest.fn();
  const load = jest.fn();
  const key = async (eventType: string, eventKeyAction = 0) => {
    await act(async () =>
      jest
        .mocked(useTVEventHandler)
        .mock.lastCall![0]({ eventType, eventKeyAction }),
    );
  };
  const activate = () =>
    renderer.root
      .findAllByProps({ testID: 'live-channel-drawer-focus' })
      .find(node => typeof node.props.onPress === 'function')!.props.onPress;
  const mount = async () => {
    await act(async () => {
      renderer = Renderer.create(
        <LiveChannelDrawer
          item={channels[25]}
          loadChannels={load}
          onSelectChannel={select}
          onClose={jest.fn()}
        />,
      );
    });
  };
  beforeEach(() => {
    jest.clearAllMocks();
    liveEpgStore.publish([]);
    load.mockResolvedValue(channels);
  });
  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
  });

  it('updates the open list from global EPG without reloading or moving selection', async () => {
    await mount();
    await act(async () => {
      liveEpgStore.publish(
        channels.map(channel => ({
          ...channel,
          title: `Updated ${channel.id}`,
        })),
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('Updated ch25');
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      activate()();
    });
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ch25', title: 'Updated ch25' }),
    );
  });

  it('focuses the playing channel and keeps the rendered list bounded', async () => {
    await mount();
    expect(
      new Set(
        renderer.root
          .findAll(
            node =>
              typeof node.props.testID === 'string' &&
              node.props.testID.startsWith('drawer-channel-ch'),
          )
          .map(node => node.props.testID),
      ).size,
    ).toBeLessThan(20);
    await act(async () => activate()());
    expect(select).toHaveBeenLastCalledWith(channels[25]);
  });
  it('browses without switching and retained activation reads the latest highlighted channel', async () => {
    await mount();
    const retained = activate();
    await key('down');
    await key('down', 1);
    await key('volumeUp');
    expect(select).not.toHaveBeenCalled();
    await act(async () => retained());
    expect(select).toHaveBeenLastCalledWith(channels[26]);
  });
  it('shows the highlighted program artwork and keeps the playing channel marked while browsing', async () => {
    await mount();
    const artwork = () =>
      renderer.root.findByProps({ testID: 'drawer-active-program-image' });
    const row = (id: string) =>
      renderer.root
        .findAllByProps({ testID: `drawer-channel-${id}` })
        .find(node => typeof node.props.onPress === 'function')!;
    expect(artwork().props.uri).toBe(channels[25].imageUrl);
    expect(row('ch25').props.accessibilityState).toEqual({
      selected: true,
      checked: true,
    });
    await key('down');
    expect(artwork().props.uri).toBe(channels[26].imageUrl);
    expect(row('ch25').props.accessibilityState).toEqual({
      selected: false,
      checked: true,
    });
    expect(row('ch26').props.accessibilityState).toEqual({
      selected: true,
      checked: false,
    });
    expect(StyleSheet.flatten(row('ch25').props.style).borderColor).toBe(
      '#25d4de',
    );
    expect(StyleSheet.flatten(row('ch26').props.style).height).toBeGreaterThan(
      StyleSheet.flatten(row('ch25').props.style).height,
    );
    expect(select).not.toHaveBeenCalled();
  });
  it('lets Select retry a failed channel-list request', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () => activate()());
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => activate()());
    expect(select).toHaveBeenLastCalledWith(channels[25]);
  });
  it('handles an empty list without selecting or failing on navigation', async () => {
    load.mockResolvedValue([]);
    await mount();
    await key('up');
    await key('down');
    await act(async () => activate()());
    expect(select).not.toHaveBeenCalled();
  });
  it('also selects the clicked row without requiring a remote focus change', async () => {
    await mount();
    const row = renderer.root
      .findAllByProps({ testID: 'drawer-channel-ch26' })
      .find(node => typeof node.props.onPress === 'function')!;
    await act(async () => row.props.onPress());
    expect(select).toHaveBeenLastCalledWith(channels[26]);
  });
});
