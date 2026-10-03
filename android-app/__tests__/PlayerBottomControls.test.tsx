import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useTVEventHandler } from 'react-native';
import {
  PlayerBottomControls,
  type ControlId,
} from '../src/components/player/PlayerBottomControls';
import type { MediaItem, VideoQualityOption } from '../src/media/player';

jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((props: any, ref: any) =>
      ReactModule.createElement(
        'Pressable',
        { ...props, ref },
        typeof props.children === 'function'
          ? props.children({ focused: false })
          : props.children,
      ),
    ),
  };
});

describe('PlayerBottomControls timeline', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let remoteHandler: (event: {
    eventType: string;
    eventKeyAction?: number;
  }) => void;
  const onSeek = jest.fn();
  const focusRequests = new Map<string, jest.Mock>();

  beforeEach(() => {
    jest.useFakeTimers();
    onSeek.mockClear();
    focusRequests.clear();
    jest.mocked(useTVEventHandler).mockImplementation(handler => {
      remoteHandler = handler;
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function render(
    kind: MediaItem['kind'] = 'vod',
    currentTime = 120,
    duration = 300,
    selectedQualityId = 'auto',
    videoQualities: VideoQualityOption[] = [],
  ) {
    function Harness() {
      const [focused, setFocused] = React.useState<ControlId>('play-pause');
      return (
        <PlayerBottomControls
          item={{ id: 'test', kind, title: 'Test' }}
          paused={false}
          currentTime={currentTime}
          duration={duration}
          selectedQualityId={selectedQualityId}
          videoQualities={videoQualities}
          hasAlternateSources={false}
          lastFocusedControl={focused}
          onFocusControl={setFocused}
          onSeek={onSeek}
          onTogglePlayPause={jest.fn()}
          onOpenQuality={jest.fn()}
          onOpenSources={jest.fn()}
          onOpenMultiView={jest.fn()}
        />
      );
    }
    await act(async () => {
      renderer = ReactTestRenderer.create(<Harness />, {
        createNodeMock: element => {
          const id = (element.props as { testID?: string }).testID;
          const requestTVFocus = jest.fn();
          if (id) {
            focusRequests.set(id, requestTVFocus);
          }
          return { requestTVFocus };
        },
      });
    });
  }

  async function focus(testID: string) {
    await act(async () =>
      renderer.root.findByProps({ testID }).props.onFocus(),
    );
  }

  async function press(eventType: string, eventKeyAction = 0) {
    await act(async () => remoteHandler({ eventType, eventKeyAction }));
  }

  it('moves up to the timeline and down to the previous row control', async () => {
    await render();
    await focus('quality-button');
    await press('up');
    expect(focusRequests.get('player-timeline')).toHaveBeenCalled();
    await focus('player-timeline');
    expect(
      renderer.root.findByProps({ testID: 'player-timeline' }).props
        .hasTVPreferredFocus,
    ).toBe(true);
    await press('down');
    expect(focusRequests.get('quality-button')).toHaveBeenCalled();
  });

  it('seeks cumulatively by ten seconds and ignores key releases', async () => {
    await render();
    await focus('player-timeline');
    await press('right');
    await press('right');
    await press('right', 1);
    await press('left');
    expect(onSeek.mock.calls).toEqual([[130], [140], [130]]);
    expect(
      renderer.root.findByProps({ testID: 'player-timeline' }).props
        .accessibilityValue.now,
    ).toBe(130);
  });

  it.each([
    ['', [{ id: '1080', label: '1080p', height: 1080, active: true }], '1080p'],
    ['auto', [{ id: '720', label: '720p', active: true }], '720p'],
    ['auto', [{ id: '1080', label: '1080p', height: 1080 }], 'Auto'],
  ] as const)(
    'shows %s auto quality as %s when tracks are %j',
    async (selectedQualityId, videoQualities, expectedBadge) => {
      await render('live', 120, 300, selectedQualityId, [
        { id: 'auto', label: 'Auto (HD)' },
        ...videoQualities,
      ]);
      expect(
        renderer.root.findByProps({ testID: 'quality-value' }).props.children,
      ).toBe(expectedBadge);
    },
  );

  it.each(['vod', 'live'] as const)(
    'retains %s focus at both row boundaries',
    async kind => {
      await render(kind);
      await focus('play-pause-button');
      await press('up');
      await focus('player-timeline');
      await press('down');
      await focus('play-pause-button');
      await press('left');
      await press('left');
      expect(focusRequests.get('play-pause-button')).toHaveBeenCalledTimes(3);
      await focus('quality-button');
      await press('right');
      await press('right');
      expect(focusRequests.get('quality-button')).toHaveBeenCalledTimes(2);
      await press('left');
      expect(
        focusRequests.get(
          kind === 'live' ? 'multiview-button' : 'play-pause-button',
        ),
      ).toHaveBeenCalled();
      await press('up');
      expect(focusRequests.get('player-timeline')).toHaveBeenCalledTimes(2);
    },
  );

  it('ignores a delayed blur from the previous control', async () => {
    await render();
    await focus('play-pause-button');
    await focus('quality-button');
    await act(async () =>
      renderer.root.findByProps({ testID: 'play-pause-button' }).props.onBlur(),
    );
    await press('left');
    expect(focusRequests.get('play-pause-button')).toHaveBeenCalledTimes(1);
  });

  it('does not schedule another focus request for an already focused control', async () => {
    await render();
    await focus('quality-button');
    await act(async () => jest.advanceTimersByTime(100));
    expect(focusRequests.get('quality-button')).not.toHaveBeenCalled();
  });

  it('recovers the last control when a blur has no destination', async () => {
    await render();
    await focus('quality-button');
    await act(async () =>
      renderer.root.findByProps({ testID: 'quality-button' }).props.onBlur(),
    );
    await act(async () => jest.advanceTimersByTime(80));
    expect(focusRequests.get('quality-button')).toHaveBeenCalledTimes(1);
  });

  it('cancels recovery when another control receives focus', async () => {
    await render();
    await focus('quality-button');
    await act(async () =>
      renderer.root.findByProps({ testID: 'quality-button' }).props.onBlur(),
    );
    await focus('play-pause-button');
    await act(async () => jest.advanceTimersByTime(100));
    expect(focusRequests.get('quality-button')).not.toHaveBeenCalled();
  });

  it('cancels recovery when controls are hidden or a dialog opens', async () => {
    await render();
    await focus('quality-button');
    await act(async () =>
      renderer.root.findByProps({ testID: 'quality-button' }).props.onBlur(),
    );
    const requestFocus = focusRequests.get('quality-button');
    await act(async () => renderer.unmount());
    await act(async () => jest.advanceTimersByTime(100));
    expect(requestFocus).not.toHaveBeenCalled();
  });

  it('clamps seeking to the media boundaries', async () => {
    await render('vod', 5, 12);
    await focus('player-timeline');
    await press('left');
    await press('right');
    await press('right');
    expect(onSeek.mock.calls).toEqual([[0], [10], [12]]);
  });

  it.each([
    ['live', 300],
    ['vod', 0],
    ['vod', Infinity],
  ] as const)(
    'does not seek %s media with duration %s',
    async (kind, duration) => {
      await render(kind, 120, duration);
      await focus('player-timeline');
      await press('left');
      await press('right');
      expect(onSeek).not.toHaveBeenCalled();
    },
  );

  it('does not seek when buttons or another view own focus', async () => {
    await render();
    await focus('play-pause-button');
    await press('right');
    await focus('player-timeline');
    await act(async () =>
      renderer.root.findByProps({ testID: 'player-timeline' }).props.onBlur(),
    );
    await press('right');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('returns to reported playback if a seek is not acknowledged', async () => {
    await render();
    await focus('player-timeline');
    await press('right');
    await act(async () => jest.advanceTimersByTime(3000));
    expect(
      renderer.root.findByProps({ testID: 'player-timeline' }).props
        .accessibilityValue.now,
    ).toBe(120);
  });
});
