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
    debounceMs = 400,
  }: {
    onEngineReady: (engine: ReturnType<typeof useMediaPreviewEngine>) => void;
    onControllerChange: (controller: ReturnType<typeof useMediaController>) => void;
    streamResolver?: (item: MediaItem) => Promise<MediaStream>;
    debounceMs?: number;
  }) {
    const engine = useMediaPreviewEngine({ debounceMs, streamResolver });
    const controller = useMediaController();

    React.useEffect(() => {
      onEngineReady(engine);
    }, [engine, onEngineReady]);

    React.useEffect(() => {
      onControllerChange(controller);
    }, [controller, onControllerChange]);

    return null;
  }

  it('stops previous video and shows image immediately on focus, then plays video after debounce', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(async (item: MediaItem): Promise<MediaStream> => ({
      url: `https://stream.example.com/${item.id}.m3u8`,
      type: 'm3u8',
    }));

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
            debounceMs={400}
          />
        </MediaControllerProvider>,
      );
    });

    const itemA = createItem('A');

    // 1. Focus Item A
    act(() => {
      engineRef.focusMediaItem(itemA);
    });

    // Immediately: presentation should be 'background-image', status 'idle', item A
    expect(controllerRef.presentation).toBe('background-image');
    expect(controllerRef.item?.id).toBe('A');
    expect(controllerRef.status).toBe('idle');
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance 399ms - stream resolver still not called
    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(streamResolver).not.toHaveBeenCalled();

    // Advance to 400ms - debounce fires and stream resolves
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

  it('handles rapid focus movement A -> B -> C -> D -> E without 5 uncontrolled requests', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(async (item: MediaItem): Promise<MediaStream> => ({
      url: `https://stream.example.com/${item.id}.m3u8`,
      type: 'm3u8',
    }));

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
            debounceMs={400}
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
    }

    // Stream resolver should NOT have been called yet for any intermediate item
    expect(streamResolver).not.toHaveBeenCalled();

    // After remaining 300ms, debounce for E expires
    await act(async () => {
      jest.advanceTimersByTime(300);
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
            debounceMs={400}
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

    // Advance 400ms: debounce fires, streamResolver starts for 'slow'
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(streamResolver).toHaveBeenCalledWith(slowItem);

    // 2. Before slowItem resolves, focus fastItem
    act(() => {
      engineRef.focusMediaItem(fastItem);
    });

    // Immediately fastItem image is displayed, slowItem is obsoleted
    expect(controllerRef.item?.id).toBe('fast');
    expect(controllerRef.presentation).toBe('background-image');

    // 3. Now slowItem promise finally resolves in background
    await act(async () => {
      resolveSlowStream({
        url: 'https://stream.example.com/slow.m3u8',
        type: 'm3u8',
      });
    });

    // Verify slowItem did NOT win the race! Item remains 'fast'
    expect(controllerRef.item?.id).toBe('fast');
    expect(controllerRef.stream?.url).toBeUndefined();

    // 4. Now fastItem debounce expires
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    // fastItem correctly plays
    expect(controllerRef.item?.id).toBe('fast');
    expect(controllerRef.stream?.url).toBe('https://stream.example.com/fast.m3u8');
    expect(controllerRef.presentation).toBe('single-video');
  });

  it('stops video immediately when focusing a new item while already playing', async () => {
    let engineRef!: ReturnType<typeof useMediaPreviewEngine>;
    let controllerRef!: ReturnType<typeof useMediaController>;
    const streamResolver = jest.fn(async (item: MediaItem): Promise<MediaStream> => ({
      url: `https://stream.example.com/${item.id}.m3u8`,
      type: 'm3u8',
    }));

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
            debounceMs={400}
          />
        </MediaControllerProvider>,
      );
    });

    const itemA = createItem('A');
    const itemB = createItem('B');

    // Focus and play Item A
    act(() => {
      engineRef.focusMediaItem(itemA);
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(controllerRef.presentation).toBe('single-video');

    // Now focus Item B
    act(() => {
      engineRef.focusMediaItem(itemB);
    });

    // Previous video MUST STOP IMMEDIATELY (presentation reverted to background-image)
    expect(controllerRef.presentation).toBe('background-image');
    expect(controllerRef.item?.id).toBe('B');
  });
});
