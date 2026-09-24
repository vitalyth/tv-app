import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import { useMediaPreviewEngine } from '../src/media/MediaPreviewEngine';
import type { MediaItem, MediaStream } from '../src/media/player';

describe('MediaPreviewEngine', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (renderer) {
      try {
        act(() => {
          renderer?.unmount();
        });
      } catch {
        // ignore unmount errors
      }
      renderer = null;
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createItem = (id: string): MediaItem => ({
    id,
    kind: 'live',
    title: `Channel ${id}`,
    channelName: `Name ${id}`,
    backdropUrl: `https://example.com/backdrop_${id}.jpg`,
    imageUrl: `https://example.com/poster_${id}.jpg`,
  });

  function TestHarness({
    onEngineReady,
    onControllerChange,
    streamResolver,
    imageDebounceMs = 300,
    videoDebounceMs = 1000,
    debounceMs,
  }: {
    onEngineReady: (engine: ReturnType<typeof useMediaPreviewEngine>) => void;
    onControllerChange: (
      controller: ReturnType<typeof useMediaController>,
    ) => void;
    streamResolver?: (item: MediaItem) => Promise<MediaStream>;
    imageDebounceMs?: number;
    videoDebounceMs?: number;
    debounceMs?: number;
  }) {
    const engine = useMediaPreviewEngine({
      imageDebounceMs,
      videoDebounceMs,
      debounceMs,
      streamResolver,
    });
    const controller = useMediaController();

    React.useEffect(() => {
      onEngineReady(engine);
    }, [engine, onEngineReady]);

    React.useEffect(() => {
      onControllerChange(controller);
    }, [controller, onControllerChange]);

    return null;
  }

  it('stops previous video and clears image on focus, shows image after 300ms, then plays video after 1000ms', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(
      async (item: MediaItem): Promise<MediaStream> => ({
        url: `https://stream.example.com/${item.id}.m3u8`,
        type: 'm3u8',
      }),
    );

    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <TestHarness
            onEngineReady={e => {
              engineRef = e;
            }}
            onControllerChange={c => {
              controllerRef = c;
            }}
            streamResolver={streamResolver}
            imageDebounceMs={300}
            videoDebounceMs={1000}
          />
        </MediaControllerProvider>,
      );
    });

    const itemA = createItem('A');

    // 1. Focus Item A
    act(() => {
      engineRef.focusMediaItem(itemA);
    });

    // Immediately on focus: video stopped and image cleared
    expect(controllerRef.presentation).toBe('background-image');
    expect(controllerRef.item).toBeUndefined();
    expect(controllerRef.status).toBe('idle');
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance 299ms: still no image
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(controllerRef.item).toBeUndefined();
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance to 300ms: image debounce fires!
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(controllerRef.item?.id).toBe('A');
    expect(controllerRef.presentation).toBe('background-image');
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance to 999ms: video debounce has not fired yet
    act(() => {
      jest.advanceTimersByTime(699);
    });
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance to 1000ms: video debounce fires and stream resolves!
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(streamResolver).toHaveBeenCalledTimes(1);
    expect(streamResolver).toHaveBeenCalledWith(itemA);

    // Presentation should now be 'single-video', status 'loading'
    expect(controllerRef.presentation).toBe('single-video');
    expect(controllerRef.status).toBe('loading');
    expect(controllerRef.stream?.url).toBe('https://stream.example.com/A.m3u8');
  });

  it('handles rapid focus movement A -> B -> C -> D -> E without intermediate image or stream requests', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(
      async (item: MediaItem): Promise<MediaStream> => ({
        url: `https://stream.example.com/${item.id}.m3u8`,
        type: 'm3u8',
      }),
    );

    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <TestHarness
            onEngineReady={e => {
              engineRef = e;
            }}
            onControllerChange={c => {
              controllerRef = c;
            }}
            streamResolver={streamResolver}
            imageDebounceMs={300}
            videoDebounceMs={1000}
          />
        </MediaControllerProvider>,
      );
    });

    const items = ['A', 'B', 'C', 'D', 'E'].map(createItem);

    // Rapidly focus through A -> B -> C -> D -> E every 100ms
    for (const item of items) {
      act(() => {
        engineRef.focusMediaItem(item);
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      // While rapidly navigating (100ms < 300ms), no intermediate image is set
      expect(controllerRef.item).toBeUndefined();
    }

    // Stream resolver should NOT have been called yet for any intermediate item
    expect(streamResolver).not.toHaveBeenCalled();

    // After staying 200ms more on E (total 300ms on E), E image appears
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(controllerRef.item?.id).toBe('E');
    expect(streamResolver).not.toHaveBeenCalled();

    // After remaining 700ms (total 1000ms on E), video debounce for E expires
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    // Exactly ONE stream request was made: for E only!
    expect(streamResolver).toHaveBeenCalledTimes(1);
    expect(streamResolver).toHaveBeenCalledWith(items[4]);

    // Current active item is E
    expect(controllerRef.item?.id).toBe('E');
    expect(controllerRef.stream?.url).toBe('https://stream.example.com/E.m3u8');
    expect(controllerRef.presentation).toBe('single-video');
  });

  it('prevents stale stream resolution responses from winning races', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    let resolveSlowStream: (stream: MediaStream) => void;

    const streamResolver = jest.fn((item: MediaItem) => {
      if (item.id === 'slow') {
        return new Promise<MediaStream>(resolve => {
          resolveSlowStream = resolve;
        });
      }
      return Promise.resolve({
        url: `https://stream.example.com/${item.id}.m3u8`,
        type: 'm3u8' as const,
      });
    });

    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <TestHarness
            onEngineReady={e => {
              engineRef = e;
            }}
            onControllerChange={c => {
              controllerRef = c;
            }}
            streamResolver={streamResolver}
            imageDebounceMs={300}
            videoDebounceMs={1000}
          />
        </MediaControllerProvider>,
      );
    });

    const slowItem = createItem('slow');
    const fastItem = createItem('fast');

    // 1. Focus slow item
    act(() => {
      engineRef.focusMediaItem(slowItem);
    });

    // Advance 300ms: slowItem image appears
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(controllerRef.item?.id).toBe('slow');

    // Advance to 1000ms: video debounce fires, streamResolver starts for 'slow'
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(streamResolver).toHaveBeenCalledWith(slowItem);

    // 2. Before slowItem resolves, focus fastItem
    act(() => {
      engineRef.focusMediaItem(fastItem);
    });

    // Immediately on focus: video stopped and image cleared
    expect(controllerRef.item).toBeUndefined();
    expect(controllerRef.presentation).toBe('background-image');

    // 3. Now slowItem promise finally resolves in background
    await act(async () => {
      resolveSlowStream({
        url: 'https://stream.example.com/slow.m3u8',
        type: 'm3u8',
      });
    });

    // Verify slowItem did NOT win the race! Item is not slow
    expect(controllerRef.item?.id).not.toBe('slow');
    expect(controllerRef.stream?.url).toBeUndefined();

    // 4. Advance 300ms on fastItem: fastItem image appears
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(controllerRef.item?.id).toBe('fast');

    // 5. Advance to 1000ms on fastItem: fastItem video plays
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    // fastItem correctly plays
    expect(controllerRef.item?.id).toBe('fast');
    expect(controllerRef.stream?.url).toBe(
      'https://stream.example.com/fast.m3u8',
    );
    expect(controllerRef.presentation).toBe('single-video');
  });

  it('stops video immediately when focusing a new item while already playing', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(
      async (item: MediaItem): Promise<MediaStream> => ({
        url: `https://stream.example.com/${item.id}.m3u8`,
        type: 'm3u8',
      }),
    );

    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <TestHarness
            onEngineReady={e => {
              engineRef = e;
            }}
            onControllerChange={c => {
              controllerRef = c;
            }}
            streamResolver={streamResolver}
            imageDebounceMs={300}
            videoDebounceMs={1000}
          />
        </MediaControllerProvider>,
      );
    });

    const itemA = createItem('A');
    const itemB = createItem('B');

    // Focus and play Item A (advance 1000ms)
    act(() => {
      engineRef.focusMediaItem(itemA);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(controllerRef.presentation).toBe('single-video');

    // Now focus Item B
    act(() => {
      engineRef.focusMediaItem(itemB);
    });

    // Previous video MUST STOP IMMEDIATELY and image cleared
    expect(controllerRef.presentation).toBe('background-image');
    expect(controllerRef.item).toBeUndefined();

    // After 300ms, item B image appears
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(controllerRef.item?.id).toBe('B');

    // After 1000ms total, item B video plays
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(controllerRef.presentation).toBe('single-video');
    expect(controllerRef.item?.id).toBe('B');
  });
});
