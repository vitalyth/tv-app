import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {SubtitleDialog} from '../src/components/player/SubtitleDialog';
import {MediaControllerProvider, useMediaController, type MediaControllerValue} from '../src/media/MediaController';

it('starts off, remembers enabled language across sources and restarts, and remembers Off', async () => {
  let controller!: MediaControllerValue;
  function Probe() {controller = useMediaController(); return null;}
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const mount = async () => {await act(async () => {
    renderer = ReactTestRenderer.create(<MediaControllerProvider><Probe /></MediaControllerProvider>);
  });};
  await mount();
  const item = {id: 'live', kind: 'live' as const, title: 'Live'};
  await act(async () => controller.playFullscreen(item, {url: 'https://example.com/a.m3u8'}));
  await act(async () => controller.setSubtitleTracks([{id: '0', label: 'עברית', language: 'heb'}]));
  expect(controller.selectedSubtitleId).toBe('off');
  await act(async () => controller.setSelectedSubtitle('0'));
  expect(controller.selectedSubtitleId).toBe('0');
  await act(async () => controller.playFullscreen(item, {url: 'https://example.com/b.m3u8'}));
  expect(controller.subtitleTracks).toEqual([]);
  await act(async () => controller.setSubtitleTracks([
    {id: '0', label: 'English', language: 'eng'}, {id: '3', label: 'Hebrew CC', language: 'he'},
  ]));
  expect(controller.selectedSubtitleId).toBe('3');
  await act(async () => controller.setSubtitleTracks([]));
  expect(controller.selectedSubtitleId).toBe('off');
  await act(async () => controller.setSubtitleTracks([{id: '2', label: 'עברית', language: 'he'}]));
  expect(controller.selectedSubtitleId).toBe('2');
  await act(async () => renderer.unmount());
  await mount();
  await act(async () => controller.setSubtitleTracks([{id: '4', label: 'עברית', language: 'he'}]));
  expect(controller.selectedSubtitleId).toBe('4');
  await act(async () => controller.setSelectedSubtitle('off'));
  await act(async () => renderer.unmount());
  await mount();
  await act(async () => controller.setSubtitleTracks([{id: '0', label: 'עברית', language: 'he'}]));
  expect(controller.selectedSubtitleId).toBe('off');
  await act(async () => renderer.unmount());
});

it('lets the remote choose a subtitle track and turn subtitles off', () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const props = {tracks: [{id: '0', label: 'עברית'}, {id: '1', label: 'English'}], onSelect, onClose};
  act(() => {renderer = ReactTestRenderer.create(<SubtitleDialog {...props} selectedId="off" />);});
  expect(renderer.root.findByProps({testID: 'subtitle-option-off'}).props.hasTVPreferredFocus).toBe(true);
  act(() => renderer.root.findByProps({testID: 'subtitle-option-1'}).props.onPress());
  expect(onSelect).toHaveBeenLastCalledWith('1');
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.update(<SubtitleDialog {...props} selectedId="1" />));
  expect(renderer.root.findByProps({testID: 'subtitle-option-1'}).props.hasTVPreferredFocus).toBe(true);
  act(() => renderer.root.findByProps({testID: 'subtitle-option-off'}).props.onPress());
  expect(onSelect).toHaveBeenLastCalledWith('off');
  act(() => renderer.unmount());
});
