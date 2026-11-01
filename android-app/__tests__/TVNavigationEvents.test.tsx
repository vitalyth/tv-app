import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppState, type AppStateStatus, type HWEvent} from 'react-native';
import {useTVNavigationEventHandler} from '../src/hooks/useTVNavigationEventHandler';

let mockRemote: (event: HWEvent) => void;
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  return Object.defineProperty(native, 'useTVEventHandler', {
    value: (handler: typeof mockRemote) => { mockRemote = handler; },
  });
});
function Listener({onEvent}: {onEvent: (event: HWEvent) => void}) {
  useTVNavigationEventHandler(onEvent);
  return null;
}

describe('shared held-arrow navigation', () => {
  let renderer: Renderer.ReactTestRenderer;
  let onEvent: jest.Mock;
  let appState: (state: AppStateStatus) => void;
  const remove = jest.fn();
  const send = (eventType: string, eventKeyAction?: number) =>
    act(() => mockRemote({eventType, eventKeyAction}));
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  beforeEach(() => {
    jest.useFakeTimers();
    onEvent = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      appState = callback;
      return {remove};
    });
    act(() => { renderer = Renderer.create(<Listener onEvent={onEvent} />); });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(['Up', 'Down', 'Left', 'Right'])('repeats held %s and stops on release', direction => {
    send(`long${direction}`, 0);
    advance(360);
    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(onEvent.mock.calls.every(([event]) => event.eventType === direction.toLowerCase())).toBe(true);
    send(`long${direction}`, 1);
    const count = onEvent.mock.calls.length;
    advance(1000);
    expect(onEvent).toHaveBeenCalledTimes(count);
  });

  it('preserves ordinary presses and does not repeat selection', () => {
    send('right', 0);
    send('right', 1);
    send('longSelect', 0);
    advance(1000);
    expect(onEvent.mock.calls.map(([event]) => event.eventType)).toEqual(['right', 'right', 'longSelect']);
  });

  it('does not multiply timers when long-down notifications repeat', () => {
    send('longDown', 0);
    send('longDown', 0);
    advance(240);
    expect(onEvent).toHaveBeenCalledTimes(3);
  });

  it('uses the current handler and keeps repeating across focus events', () => {
    send('longDown', 0);
    const updated = jest.fn();
    act(() => renderer.update(<Listener onEvent={updated} />));
    send('blur');
    send('focus');
    advance(120);
    expect(updated.mock.calls.map(([event]) => event.eventType)).toEqual(['blur', 'focus', 'down']);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('switches direction and stops for another button', () => {
    send('longDown', 0);
    send('longRight', 0);
    advance(120);
    expect(onEvent.mock.calls.map(([event]) => event.eventType)).toEqual(['down', 'right', 'right']);
    send('select', 0);
    const count = onEvent.mock.calls.length;
    advance(1000);
    expect(onEvent).toHaveBeenCalledTimes(count);
  });

  it('stops when the app becomes inactive or the listener unmounts', () => {
    send('longDown', 0);
    act(() => appState('background'));
    advance(1000);
    expect(onEvent).toHaveBeenCalledTimes(1);
    send('longDown', 0);
    act(() => renderer.unmount());
    advance(1000);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalled();
  });

  it('normalizes runtimes without key actions without inventing repeats', () => {
    send('longRight');
    advance(1000);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].eventType).toBe('right');
  });
});
